import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { MessageBoxProvider } from './components/MessageBox';
import Layout from './components/Layout';
import AuthPage from './pages/Auth';
import RecruiterDashboard, { RecruiterDashboardSkeleton } from './pages/RecruiterDashboard';
import InterviewWizard from './pages/Interview';
import InterviewReport from './pages/Report';
import EditJob from './pages/EditJob';
import Profile from './pages/Profile';
import AdminDashboard from './pages/AdminDashboard';
import AdminProfile from './pages/AdminProfile';
import Blogs from './pages/Blogs';
import AdminBlogs from './pages/AdminBlogs';
import AdminStats from './pages/AdminStats';
import AdminRateLimiting from './pages/AdminRateLimiting';
import BlogDetail from './pages/BlogDetail';
import RecruiterTests from './pages/RecruiterTests';
import CreateTest from './pages/CreateTest';
import TakeTest from './pages/TakeTest';
import TestResults from './pages/TestResults';
import ContactUs from './pages/ContactUs';
import ReportBug from './pages/ReportBug';
import CreateInterview, { CreateInterviewSkeleton } from './pages/CreateInterview';
import RecruiterInterviews from './pages/RecruiterInterviews';
import InterviewAccess from './pages/InterviewAccess';
import TestAccess from './pages/TestAccess';
import InterviewResponses from './pages/InterviewResponses';
import InterviewOverview from './pages/InterviewOverview';
import InterviewCandidates from './pages/InterviewCandidates';
import ResumeDump, { ResumeDumpSkeleton } from './pages/ResumeDump';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import SubmitReview from './pages/SubmitReview';
import ReviewsPage from './pages/Reviews';
import OurJourney from './pages/OurJourney';
import InvitedCandidates from './pages/InvitedCandidates';
import CareerHub from './pages/CareerHub';
import StatusPage from './pages/Status';
import ClientView from './pages/ClientView';

const DefaultRouteLoader = () => (
  <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
  </div>
);

const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  role?: 'recruiter' | 'admin';
  loadingFallback?: React.ReactNode;
}> = ({ children, role, loadingFallback }) => {
  const { user, userProfile, loading } = useAuth();

  if (loading || (user && !userProfile)) return <>{loadingFallback || <DefaultRouteLoader />}</>;

  if (!user) return <Navigate to="/" replace />;

  const userRole: string = userProfile?.role || '';
  if (role && userRole !== role) {
    if (userRole === 'recruiter') return <Navigate to="/recruiter/jobs" replace />;
    if (userRole === 'admin') return <Navigate to="/admin" replace />;
    return <Navigate to="/auth" replace />;
  }

  return <>{children}</>;
};

const HomeRoute: React.FC = () => {
  const { user, userProfile, loading } = useAuth();

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
      <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
    </div>
  );

  if (user) {
    if (!userProfile) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-background text-foreground">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
        </div>
      );
    }
    const userRole: string = userProfile.role || '';
    if (userRole === 'recruiter') return <Navigate to="/recruiter/jobs" replace />;
    if (userRole === 'admin') return <Navigate to="/admin" replace />;
    return <Navigate to="/auth" replace />;
  }

  return <AuthPage />;
};

const App: React.FC = () => {
  return (
    <MessageBoxProvider>
      <ThemeProvider>
        <AuthProvider>
          <HashRouter>
            <Routes>
            {/* Public Routes (No Layout) */}
            <Route path="/" element={<HomeRoute />} />
            <Route path="auth" element={<AuthPage />} />
            <Route path="blogs" element={<Blogs />} />
            <Route path="contact" element={<ContactUs />} />
            <Route path="report-bug" element={<ReportBug />} />
            <Route path="privacy-policy" element={<PrivacyPolicy />} />
            <Route path="terms-of-service" element={<TermsOfService />} />
            <Route path="status" element={<StatusPage />} />
            <Route path="blog/:id" element={
              <ThemeProvider>
                <BlogDetail />
              </ThemeProvider>
            } />
            <Route path="interview/:interviewId" element={<InterviewAccess />} />
            <Route path="reviews" element={
              <ThemeProvider>
                <ReviewsPage />
              </ThemeProvider>
            } />
            <Route path="submit-review" element={
              <ThemeProvider>
                <SubmitReview />
              </ThemeProvider>
            } />
            <Route path="our-journey" element={
              <ThemeProvider>
                <OurJourney />
              </ThemeProvider>
            } />
            <Route path="career-hub" element={
              <ThemeProvider>
                <CareerHub />
              </ThemeProvider>
            } />

            {/* Admin Routes (No Standard Layout) */}
            <Route path="admin" element={
              <ThemeProvider>
                <ProtectedRoute role="admin"><AdminDashboard /></ProtectedRoute>
              </ThemeProvider>
            } />
            <Route path="admin/profile" element={
              <ThemeProvider>
                <ProtectedRoute role="admin"><AdminProfile /></ProtectedRoute>
              </ThemeProvider>
            } />
            <Route path="admin/blogs" element={
              <ThemeProvider>
                <ProtectedRoute role="admin"><AdminBlogs /></ProtectedRoute>
              </ThemeProvider>
            } />
            <Route path="admin/stats" element={
              <ThemeProvider>
                <ProtectedRoute role="admin"><AdminStats /></ProtectedRoute>
              </ThemeProvider>
            } />
            <Route path="admin/rate-limiting" element={
              <ThemeProvider>
                <ProtectedRoute role="admin"><AdminRateLimiting /></ProtectedRoute>
              </ThemeProvider>
            } />

            {/* Interview Route (No Layout) */}
            <Route path="interview/start/:interviewId" element={
              <ThemeProvider>
                <InterviewWizard />
              </ThemeProvider>
            } />

            {/* Public Test Taking Routes (No Layout) */}
            <Route path="test/:testId" element={
              <ThemeProvider>
                <TestAccess />
              </ThemeProvider>
            } />
            <Route path="test/start/:testId" element={
              <ThemeProvider>
                <TakeTest />
              </ThemeProvider>
            } />

            {/* Public Report Route (No Auth Required) */}
            <Route path="report/:interviewId" element={
              <ThemeProvider>
                <InterviewReport />
              </ThemeProvider>
            } />
            <Route path="report/:interviewId/:submissionId" element={
              <ThemeProvider>
                <InterviewReport />
              </ThemeProvider>
            } />
            <Route path="client-view/:interviewId" element={
              <ThemeProvider>
                <ClientView />
              </ThemeProvider>
            } />

            {/* Protected Routes (With Layout) */}
            <Route path="/*" element={
              <Layout>
                <Routes>
                  {/* Recruiter Routes */}
                  <Route path="recruiter/jobs" element={<ProtectedRoute role="recruiter" loadingFallback={<RecruiterDashboardSkeleton />}><RecruiterDashboard /></ProtectedRoute>} />
                  <Route path="recruiter/interviews" element={<ProtectedRoute role="recruiter"><RecruiterInterviews /></ProtectedRoute>} />
                  <Route path="recruiter/invites" element={<ProtectedRoute role="recruiter"><InvitedCandidates /></ProtectedRoute>} />
                  <Route path="recruiter/resume-dump" element={<ProtectedRoute role="recruiter" loadingFallback={<ResumeDumpSkeleton />}><ResumeDump /></ProtectedRoute>} />
                  <Route path="recruiter/interview/:interviewId" element={<ProtectedRoute role="recruiter"><InterviewOverview /></ProtectedRoute>} />
                  <Route path="recruiter/interview/:interviewId/overview" element={<ProtectedRoute role="recruiter"><InterviewOverview /></ProtectedRoute>} />
                  <Route path="recruiter/interview/:interviewId/responses" element={<ProtectedRoute role="recruiter"><InterviewResponses /></ProtectedRoute>} />
                  <Route path="recruiter/interview/:interviewId/candidates" element={<ProtectedRoute role="recruiter"><InterviewCandidates /></ProtectedRoute>} />
                  <Route path="recruiter/interview/responses/:interviewId" element={<ProtectedRoute role="recruiter"><InterviewResponses /></ProtectedRoute>} />
                  <Route path="recruiter/interview/create" element={<ProtectedRoute role="recruiter" loadingFallback={<CreateInterviewSkeleton />}><CreateInterview /></ProtectedRoute>} />
                  <Route path="recruiter/tests" element={<ProtectedRoute role="recruiter"><RecruiterTests /></ProtectedRoute>} />
                  <Route path="recruiter/tests/create" element={<ProtectedRoute role="recruiter"><CreateTest /></ProtectedRoute>} />
                  <Route path="recruiter/tests/:testId/results" element={<ProtectedRoute role="recruiter"><TestResults /></ProtectedRoute>} />
                  
                  {/* Shared Routes */}
                  <Route path="profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />

                  {/* Fallback for unmatched routes inside layout */}
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            } />
            </Routes>
          </HashRouter>
        </AuthProvider>
      </ThemeProvider>
    </MessageBoxProvider>
  );
};

export default App;
