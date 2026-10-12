import { Link } from 'react-router-dom';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { LoginForm } from '@/components/auth/LoginForm';

export default function StudentLogin() {
  return (
    <AuthLayout
      variant="student"
      title="Welcome back, learner"
      subtitle="Sign in to continue your courses, quizzes and AI tutor sessions."
      footer={<>
        New to Macro AI? <Link to="/student/register" className="link">Create a student account</Link>
        <p className="mt-2">Are you a teacher? <Link to="/teacher/login" className="link">Teacher login</Link></p>
      </>}
    >
      <LoginForm portal="student" />
    </AuthLayout>
  );
}
