import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ProtectedRoute } from '@/auth/ProtectedRoute';
import { AppShell } from '@/components/layout/AppShell';
import { FullPageSpinner } from '@/components/ui/Spinner';
import Landing from '@/pages/Landing';
import StudentLogin from '@/pages/auth/StudentLogin';
import TeacherLogin from '@/pages/auth/TeacherLogin';

const StudentRegister = lazy(() => import('@/pages/auth/StudentRegister'));
const TeacherOnboarding = lazy(() => import('@/pages/auth/TeacherOnboarding'));
const ForgotPassword = lazy(() => import('@/pages/auth/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/auth/ResetPassword'));
const SearchPage = lazy(() => import('@/pages/SearchPage'));
const StudentDashboard = lazy(() => import('@/pages/student/StudentDashboard'));
const StudentCourses = lazy(() => import('@/pages/student/StudentCourses'));
const TutorPage = lazy(() => import('@/pages/student/TutorPage'));
const QuizzesPage = lazy(() => import('@/pages/student/QuizzesPage'));
const ProgressPage = lazy(() => import('@/pages/student/ProgressPage'));
const TeacherDashboard = lazy(() => import('@/pages/teacher/TeacherDashboard'));
const TeacherCourses = lazy(() => import('@/pages/teacher/TeacherCourses'));
const CourseManage = lazy(() => import('@/pages/teacher/CourseManage'));
const TeacherStudents = lazy(() => import('@/pages/teacher/TeacherStudents'));
const CourseDetail = lazy(() => import('@/pages/CourseDetail'));
const ResourceView = lazy(() => import('@/pages/ResourceView'));
const SettingsPage = lazy(() => import('@/pages/SettingsPage'));
const AdminPage = lazy(() => import('@/pages/admin/AdminPage'));
const Unauthorized = lazy(() => import('@/pages/Unauthorized'));
const NotFound = lazy(() => import('@/pages/NotFound'));

function Shell({ roles, children }: { roles?: ('student' | 'teacher' | 'admin')[]; children: ReactNode }) {
  return (
    <ProtectedRoute roles={roles}>
      <AppShell>{children}</AppShell>
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <Suspense fallback={<FullPageSpinner />}>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/search" element={<SearchPage />} />

        <Route path="/student/login" element={<StudentLogin />} />
        <Route path="/student/register" element={<StudentRegister />} />
        <Route path="/teacher/login" element={<TeacherLogin />} />
        <Route path="/teacher/onboarding" element={<TeacherOnboarding />} />
        <Route path="/teacher/register" element={<TeacherOnboarding />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />

        <Route path="/student/dashboard" element={<Shell roles={['student']}><StudentDashboard /></Shell>} />
        <Route path="/student/courses" element={<Shell roles={['student']}><StudentCourses /></Shell>} />
        <Route path="/student/tutor" element={<Shell roles={['student']}><TutorPage /></Shell>} />
        <Route path="/student/quizzes" element={<Shell roles={['student']}><QuizzesPage /></Shell>} />
        <Route path="/student/progress" element={<Shell roles={['student']}><ProgressPage /></Shell>} />

        <Route path="/teacher/dashboard" element={<Shell roles={['teacher']}><TeacherDashboard /></Shell>} />
        <Route path="/teacher/courses" element={<Shell roles={['teacher']}><TeacherCourses /></Shell>} />
        <Route path="/teacher/courses/:id" element={<Shell roles={['teacher']}><CourseManage /></Shell>} />
        <Route path="/teacher/students" element={<Shell roles={['teacher']}><TeacherStudents /></Shell>} />

        <Route path="/courses/:id" element={<Shell><CourseDetail /></Shell>} />
        <Route path="/resources/:id" element={<Shell><ResourceView /></Shell>} />
        <Route path="/settings" element={<Shell><SettingsPage /></Shell>} />
        <Route path="/admin" element={<Shell roles={['admin']}><AdminPage /></Shell>} />

        <Route path="/unauthorized" element={<Unauthorized />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  );
}
