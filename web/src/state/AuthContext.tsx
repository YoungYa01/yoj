import { createContext, useContext, useMemo, useState } from "react";
import { request, User } from "../api/client";

interface AuthContextValue {
    user: User | null;
    token: string | null;
    login: (username: string, password: string) => Promise<void>;
    register: (username: string, password: string) => Promise<void>;
    logout: () => void;
    updateUser: (user: User) => void;
    refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredUser() {
    const raw = localStorage.getItem("yoj_user");

    if (!raw) {
        return null;
    }

    try {
        return JSON.parse(raw) as User;
    } catch {
        return null;
    }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [token, setToken] = useState(() => localStorage.getItem("yoj_token"));
    const [user, setUser] = useState<User | null>(() => loadStoredUser());

    function updateUser(nextUser: User) {
        localStorage.setItem("yoj_user", JSON.stringify(nextUser));
        setUser(nextUser);
    }

    async function persistAuth(path: "/auth/login" | "/auth/register", username: string, password: string) {
        const data = await request<{ token: string; user: User }>(path, {
            method: "POST",
            body: JSON.stringify({ username, password })
        });

        localStorage.setItem("yoj_token", data.token);
        localStorage.setItem("yoj_user", JSON.stringify(data.user));

        setToken(data.token);
        setUser(data.user);
    }

    async function refreshMe() {
        const data = await request<{ user: User }>("/auth/me");
        updateUser(data.user);
    }

    const value = useMemo(
        () => ({
            user,
            token,
            login: (username: string, password: string) => persistAuth("/auth/login", username, password),
            register: (username: string, password: string) => persistAuth("/auth/register", username, password),
            updateUser,
            refreshMe,
            logout: () => {
                localStorage.removeItem("yoj_token");
                localStorage.removeItem("yoj_user");
                setToken(null);
                setUser(null);
            }
        }),
        [user, token]
    );
    
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const value = useContext(AuthContext);

    if (!value) {
        throw new Error("useAuth must be used within AuthProvider");
    }

    return value;
}
