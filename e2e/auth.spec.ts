import { expect, test } from '@playwright/test';
import { PASSWORD, latestLink, login, logout, sql, unique } from './helpers';

test.describe('authentication and roles', () => {
  test('student signs in, lands on the student dashboard and signs out', async ({ page }) => {
    await login(page, 'student');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Demo');
    await logout(page);
    await page.goto('/student/dashboard');
    await expect(page).toHaveURL(/\/student\/login\?next=/);
  });

  test('teacher signs in to the teacher portal', async ({ page }) => {
    await login(page, 'teacher');
    await expect(page.getByText('Machine Learning Foundations').first()).toBeVisible();
  });

  test('login form validates input and toggles password visibility', async ({ page }) => {
    await page.goto('/student/login');
    await page.getByTestId('login-submit').click();
    await expect(page.getByText(/enter your email/i)).toBeVisible();
    const pw = page.getByLabel('Password', { exact: true });
    await pw.fill('secret123');
    await expect(pw).toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: /show password/i }).click();
    await expect(pw).toHaveAttribute('type', 'text');
  });

  test('wrong password shows a friendly error', async ({ page }) => {
    await page.goto('/student/login');
    await page.getByLabel('Email address').fill('student@macro.test');
    await page.getByLabel('Password', { exact: true }).fill('WrongPass123');
    await page.getByTestId('login-submit').click();
    await expect(page.getByRole('alert')).toContainText(/incorrect|invalid/i);
    await expect(page).toHaveURL(/\/student\/login/);
  });

  test('a student cannot sign in through the teacher portal', async ({ page }) => {
    await page.goto('/teacher/login');
    await page.getByLabel('Email address').fill('student@macro.test');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page.getByRole('alert')).toContainText(/does not have teacher access/i);
    await expect(page).toHaveURL(/\/teacher\/login/);
  });

  test('role guards: students are kept out of teacher pages and vice versa', async ({ page }) => {
    await login(page, 'student');
    for (const p of ['/teacher/dashboard', '/teacher/courses', '/admin']) {
      await page.goto(p);
      await expect(page).toHaveURL(/\/unauthorized/);
    }
    await page.getByRole('button', { name: 'Sign out and switch account' }).click();
    await expect(page).toHaveURL(/\/$/);
    await login(page, 'teacher');
    await page.goto('/student/quizzes');
    await expect(page).toHaveURL(/\/unauthorized/);
  });

  test('signed-out visitors are sent to the right login page and back afterwards', async ({ page }) => {
    await page.goto('/teacher/students');
    await expect(page).toHaveURL(/\/teacher\/login\?next=%2Fteacher%2Fstudents/);
    await page.goto('/student/quizzes');
    await expect(page).toHaveURL(/\/student\/login\?next=%2Fstudent%2Fquizzes/);
    await page.getByLabel('Email address').fill('student@macro.test');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL(/\/student\/quizzes/);
  });

  test('student registration always creates a student, whatever the client sends', async ({ page }) => {
    const email = unique('newstudent');
    await page.goto('/student/register');
    await page.getByRole('button', { name: 'Create student account' }).click();
    await expect(page.getByText(/enter your full name/i)).toBeVisible();
    await page.getByLabel('Full name').fill('New Student');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create student account' }).click();
    await expect(page).toHaveURL(/\/student\/dashboard/);
    expect(sql(`select role from profiles where email = '${email}'`)).toBe('student');
    expect(sql(`select count(*) from auth.users where email = '${email}' and encrypted_password like '$2%'`)).toBe('1');
  });

  test('teacher onboarding needs an admin invitation bound to the email', async ({ page, browser }) => {
    const email = unique('newteacher');
    // Admin creates the invitation in the admin console.
    const admin = await browser.newPage();
    await admin.goto('/teacher/login');
    await admin.getByLabel('Email address').fill('admin@macro.test');
    await admin.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await admin.getByTestId('login-submit').click();
    await expect(admin).toHaveURL(/\/teacher\/dashboard/);
    await admin.goto('/admin');
    await admin.getByLabel("Teacher's email").fill(email);
    await admin.getByRole('button', { name: 'Create invitation' }).click();
    const code = (await admin.getByTestId('invite-code').innerText()).trim();
    expect(code).toMatch(/^MAC-[0-9A-F]{24}$/);
    expect(sql(`select count(*) from teacher_invitations where code_hash = '${code}'`)).toBe('0'); // only the hash is stored
    await admin.close();

    await page.goto('/teacher/onboarding');
    await page.getByLabel('Full name').fill('New Teacher');
    await page.getByLabel('Invited email address').fill(email);
    await page.getByLabel('Invitation code').fill('MAC-000000000000000000000000');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('button', { name: /create teacher account/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /not valid/i })).toBeVisible();
    expect(sql(`select count(*) from profiles where email = '${email}'`)).toBe('0');

    await page.getByLabel('Invitation code').fill(code.toLowerCase());
    await page.getByRole('button', { name: /create teacher account/i }).click();
    await expect(page).toHaveURL(/\/teacher\/dashboard/);
    expect(sql(`select role from profiles where email = '${email}'`)).toBe('teacher');
    expect(sql(`select accepted_at is not null from teacher_invitations where email = '${email}'`)).toBe('t');
  });

  test('password reset email link lets the user set a new password', async ({ page }) => {
    const email = unique('resetme');
    // Create the account through the UI so it goes through the real Auth API.
    await page.goto('/student/register');
    await page.getByLabel('Full name').fill('Reset Me');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Create student account' }).click();
    await expect(page).toHaveURL(/\/student\/dashboard/);
    await logout(page);

    const sentAfter = Date.now();
    await page.goto('/forgot-password?portal=student');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByText(/password reset link is on its way/i)).toBeVisible();

    const link = await latestLink(email, /verify/, sentAfter);
    await page.goto(link);
    await expect(page).toHaveURL(/\/reset-password/);
    const newPass = 'NewPassw0rd!45';
    await page.getByLabel('New password', { exact: true }).fill(newPass);
    await page.getByLabel('Confirm new password').fill(newPass);
    await page.getByRole('button', { name: 'Update password' }).click();
    await expect(page).toHaveURL(/\/student\/login\?reset=1/);
    await login(page, 'student', email, newPass);
  });
});
