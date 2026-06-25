import {Navigate, Route, Routes} from "react-router-dom";
import AppShell from "./components/AppShell";
import {useAuth} from "./state/AuthContext";
import LoginPage from "./pages/LoginPage";
import RegisterPage from "./pages/RegisterPage";
import ProblemListPage from "./pages/ProblemListPage";
import ProblemDetailPage from "./pages/ProblemDetailPage";
import SubmissionsPage from "./pages/SubmissionsPage";
import SubmissionDetailPage from "./pages/SubmissionDetailPage";
import ContestListPage from "./pages/ContestListPage";
import ContestDetailPage from "./pages/ContestDetailPage";
import ContestProblemPage from "./pages/ContestProblemPage";
import AdminProblemListPage from "./pages/admin/AdminProblemListPage";
import AdminProblemFormPage from "./pages/admin/AdminProblemFormPage";
import AdminTestCasesPage from "./pages/admin/AdminTestCasesPage";
import AdminSubmissionsPage from "./pages/admin/AdminSubmissionsPage";
import AdminUsersPage from "./pages/admin/AdminUsersPage";
import AdminDashboardPage from "./pages/admin/AdminDashboardPage";
import AdminTagsPage from "./pages/admin/AdminTagsPage";
import AdminContestListPage from "./pages/admin/AdminContestListPage";
import AdminContestFormPage from "./pages/admin/AdminContestFormPage";
import ProfilePage from "./pages/ProfilePage";

function RequireAuth({children}: { children: JSX.Element }) {
    const {user} = useAuth();
    if (!user) {
        return <Navigate to="/login" replace/>;
    }
    return children;
}

function RequireAdmin({children}: { children: JSX.Element }) {
    const {user} = useAuth();
    if (!user) {
        return <Navigate to="/login" replace/>;
    }
    if (user.role !== "admin") {
        return <Navigate to="/" replace/>;
    }
    return children;
}

export default function App() {
    return (
        <Routes>
            <Route element={<AppShell/>}>
                <Route index element={<ProblemListPage/>}/>
                <Route path="/login" element={<LoginPage/>}/>
                <Route path="/register" element={<RegisterPage/>}/>
                <Route path="/profile" element={<RequireAuth><ProfilePage/></RequireAuth>}/>
                <Route path="/problems/:id" element={<ProblemDetailPage/>}/>
                <Route path="/contests" element={<ContestListPage/>}/>
                <Route path="/contests/:id" element={<ContestDetailPage/>}/>
                <Route path="/contests/:id/problems/:problemId" element={<RequireAuth><ContestProblemPage/></RequireAuth>}/>
                <Route path="/submissions" element={<RequireAuth><SubmissionsPage/></RequireAuth>}/>
                <Route path="/submissions/:id" element={<RequireAuth><SubmissionDetailPage/></RequireAuth>}/>
                <Route path="/admin" element={<RequireAdmin><Navigate to="/admin/dashboard" replace/></RequireAdmin>}/>
                <Route path="/admin/dashboard" element={<RequireAdmin><AdminDashboardPage/></RequireAdmin>}/>
                <Route
                    path="/admin/problems"
                    element={
                        <RequireAdmin>
                            <AdminProblemListPage/>
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/problems/new"
                    element={
                        <RequireAdmin>
                            <AdminProblemFormPage/>
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/problems/:id/edit"
                    element={
                        <RequireAdmin>
                            <AdminProblemFormPage/>
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/problems/:id/test-cases"
                    element={
                        <RequireAdmin>
                            <AdminTestCasesPage/>
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/tags"
                    element={
                        <RequireAdmin>
                            <AdminTagsPage/>
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/contests"
                    element={
                        <RequireAdmin>
                            <AdminContestListPage/>
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/contests/new"
                    element={
                        <RequireAdmin>
                            <AdminContestFormPage/>
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/contests/:id/edit"
                    element={
                        <RequireAdmin>
                            <AdminContestFormPage/>
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/submissions"
                    element={
                        <RequireAdmin>
                            <AdminSubmissionsPage/>
                        </RequireAdmin>
                    }
                />
                <Route
                    path="/admin/users"
                    element={
                        <RequireAdmin>
                            <AdminUsersPage/>
                        </RequireAdmin>
                    }
                />
            </Route>
        </Routes>
    );
}
