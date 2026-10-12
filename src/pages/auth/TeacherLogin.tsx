import { Link } from 'react-router-dom';
import { AuthLayout } from '@/components/auth/AuthLayout';
import { LoginForm } from '@/components/auth/LoginForm';

export default function TeacherLogin() {
  return (
    <AuthLayout
      variant="teacher"
      title="Teacher sign in"
      subtitle="Manage courses, learning materials, assessments and student progress."
      footer={<>
        Received an invitation from your institution? <Link to="/teacher/onboarding" className="link">Set up your teacher account</Link>
        <p className="mt-2">Studying? <Link to="/student/login" className="link">Student login</Link></p>
      </>}
    >
      <LoginForm portal="teacher" />
    </AuthLayout>
  );
}
