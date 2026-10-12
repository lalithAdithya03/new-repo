import { expect, test } from '@playwright/test';
import { login, sql, tinyPdf } from './helpers';

test.describe('landing and search', () => {
  test('landing page has hero, both logins, search, features and footer', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Knowledge Without Boundaries').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /student login/i }).first()).toBeVisible();
    await expect(page.getByRole('link', { name: /teacher login/i }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible();
    for (const f of ['AI Tutor', 'Smart Search', 'Adaptive Quizzes', 'Course Materials', 'Progress Tracking']) {
      await expect(page.getByRole('heading', { name: f, exact: true })).toBeVisible();
    }
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });

  test('visitors search public catalogue records from Supabase, not course materials', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('searchbox').first().fill('machine learning');
    await page.getByRole('button', { name: 'Search', exact: true }).first().click();
    await expect(page).toHaveURL(/\/search\?q=machine/);
    await expect(page.getByTestId('search-result').filter({ hasText: 'Machine Learning Foundations' })).toBeVisible();
    // Materials need enrolment, so an anonymous visitor never sees resources or passages.
    await page.goto('/search?q=overfitting');
    await expect(page.getByText(/Overfitting/).first()).toBeVisible();
    await expect(page.getByTestId('search-result').filter({ hasText: 'Textbook: ML Basics' })).toHaveCount(0);
  });

  test('enrolled students search their materials with filters; other courses stay hidden', async ({ page }) => {
    await login(page, 'student');
    await page.goto('/search?q=gradient');
    await expect(page.getByTestId('search-result').first()).toBeVisible();
    await expect(page.getByTestId('search-result').filter({ hasText: /Textbook: ML Basics|p\.\d+/ }).first()).toBeVisible();
    await expect(page.locator('mark').first()).toBeVisible();

    await page.goto('/search?q=velocity');
    await expect(page.getByTestId('search-result').filter({ hasText: 'Notes: Equations of Motion' })).toHaveCount(0);

    await page.goto('/search?q=validation');
    await page.getByRole('group', { name: 'Resource type filters' }).getByRole('button', { name: /slides/i }).click();
    await expect(page.getByTestId('search-result').first()).toBeVisible();
    for (const t of await page.getByTestId('search-result').allInnerTexts()) expect(t).toMatch(/slide/i);

    await page.goto('/search?q=zzqxv%20nonexistent');
    await expect(page.getByText('No results found')).toBeVisible();
  });
});

test.describe('learning features', () => {
  test('adaptive quiz is graded on the server and updates mastery', async ({ page }) => {
    await login(page, 'student');
    const before = +sql(`select count(*) from quiz_attempts a join profiles p on p.id = a.student_id where p.email = 'student@macro.test' and a.submitted_at is not null`);
    await page.goto('/student/quizzes');
    await page.locator('#qn').selectOption('5');
    await page.getByTestId('start-adaptive').click();
    const questions = page.getByTestId('quiz-question');
    await expect(questions).toHaveCount(5);
    // Answer keys must never reach the browser.
    const html = await page.content();
    expect(html).not.toMatch(/correct_option|accepted_answers|numeric_answer/);
    for (const q of await questions.all()) {
      if (await q.getByRole('radio').count()) await q.getByRole('radio').first().check();
      else if (await q.getByLabel('Your answer').count()) await q.getByLabel('Your answer').fill('overfitting');
      else await q.getByLabel('Your numerical answer').fill('0.5');
    }
    await page.getByTestId('submit-quiz').click();
    await expect(page.getByTestId('quiz-results')).toBeVisible();
    await expect(page.getByTestId('quiz-results')).toContainText(/\d+\s*\/\s*5|%/);
    const after = +sql(`select count(*) from quiz_attempts a join profiles p on p.id = a.student_id where p.email = 'student@macro.test' and a.submitted_at is not null`);
    expect(after).toBe(before + 1);
    expect(+sql(`select count(*) from topic_mastery m join profiles p on p.id = m.student_id where p.email = 'student@macro.test'`)).toBeGreaterThan(0);
  });

  test('teacher quiz can be taken from the quizzes page', async ({ page }) => {
    await login(page, 'student');
    await page.goto('/student/quizzes');
    const row = page.getByRole('listitem').filter({ hasText: 'Week 5 Checkpoint' });
    await row.getByRole('button', { name: 'Start' }).click();
    await expect(page.getByTestId('quiz-question')).toHaveCount(5);
  });

  test('tutor answers from course material with citations, and flags uncovered questions', async ({ page }) => {
    await login(page, 'student');
    await page.goto('/student/tutor');
    await page.getByPlaceholder(/Ask a question/).fill('What is gradient descent?');
    await page.getByRole('button', { name: 'Send' }).click();
    const answer = page.getByTestId('tutor-answer').last();
    await expect(answer).toBeVisible();
    // No AI key locally, so the tutor runs in clearly labelled demo mode, quoting sources.
    await expect(answer).toContainText(/Demo mode|source-backed/);
    await expect(answer.getByTestId('citation').first()).toBeVisible();
    await answer.getByTestId('citation').first().click();
    await expect(page).toHaveURL(/\/resources\/.+chunk=/);

    await page.goto('/student/tutor');
    await page.getByPlaceholder(/Ask a question/).fill('Who won the 1998 football world cup final in Paris?');
    await page.getByRole('button', { name: 'Send' }).click();
    await expect(page.getByTestId('tutor-answer').last()).toContainText('Not covered by your material');
    await expect(page.getByTestId('tutor-answer').last().getByTestId('citation')).toHaveCount(0);
  });

  test('teacher uploads a PDF; its pages become searchable for enrolled students', async ({ page, browser }) => {
    await login(page, 'teacher');
    await page.goto('/teacher/courses');
    await page.getByRole('link', { name: /Machine Learning Foundations/ }).first().click();
    await expect(page).toHaveURL(/\/teacher\/courses\/.+/);
    const stamp = Date.now().toString(36);
    const title = `Handout ${stamp}`;
    const word = `quokka${stamp}`;
    await page.locator('input[type=file]').setInputFiles({
      name: 'handout.pdf', mimeType: 'application/pdf',
      buffer: tinyPdf(['Momentum accumulates past gradients to dampen oscillation.', `${word} is a made-up word for this test.`]),
    });
    await page.getByLabel('Title').fill(title);
    await page.getByRole('button', { name: 'Add material' }).click();
    await expect(page.getByText(/searchable sections/)).toBeVisible({ timeout: 20_000 });
    expect(sql(`select count(*) from storage.objects o join resources r on r.storage_path = o.name where r.title = '${title}'`)).toBe('1');

    const student = await browser.newPage();
    await login(student, 'student');
    await student.goto(`/search?q=${word}`);
    await expect(student.getByTestId('search-result').first()).toContainText(title);
    await student.getByTestId('search-result').first().click();
    await expect(student.getByText(word).first()).toBeVisible();
    await student.close();
  });
});
