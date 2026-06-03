import { ConfigProvider, theme as antdTheme } from "antd";
import type { ThemeConfig } from "antd";
import zhCN from "antd/locale/zh_CN";
import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState
} from "react";
import type { ReactNode } from "react";

export type ThemeAppearance = "light" | "dark" | "system";
export type ThemeDensity = "comfortable" | "compact";
export type ThemeRadius = "standard" | "rounded";
export type EditorTheme = "system" | "light" | "dark";

export interface ThemeColorPreset {
    key: string;
    name: string;
    color: string;
}

export interface ThemePreferences {
    appearance: ThemeAppearance;
    primaryColor: string;
    density: ThemeDensity;
    radius: ThemeRadius;
    editorTheme: EditorTheme;
}

interface ThemeContextValue {
    preferences: ThemePreferences;
    resolvedAppearance: "light" | "dark";
    monacoTheme: "light" | "vs-dark";
    colorPresets: ThemeColorPreset[];
    updateTheme: (patch: Partial<ThemePreferences>) => void;
    resetTheme: () => void;
}

const STORAGE_KEY = "yoj_theme_preferences";

export const themeColorPresets: ThemeColorPreset[] = [
    { key: "blue", name: "竞赛蓝", color: "#1d4ed8" },
    { key: "purple", name: "紫罗兰", color: "#7c3aed" },
    { key: "cyan", name: "清爽青", color: "#0891b2" },
    { key: "green", name: "通过绿", color: "#059669" },
    { key: "orange", name: "活力橙", color: "#ea580c" },
    { key: "rose", name: "玫瑰红", color: "#e11d48" }
];

const defaultThemePreferences: ThemePreferences = {
    appearance: "light",
    primaryColor: "#1d4ed8",
    density: "comfortable",
    radius: "standard",
    editorTheme: "dark"
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredTheme(): ThemePreferences {
    const raw = localStorage.getItem(STORAGE_KEY);

    if (!raw) {
        return defaultThemePreferences;
    }

    try {
        return {
            ...defaultThemePreferences,
            ...(JSON.parse(raw) as Partial<ThemePreferences>)
        };
    } catch {
        return defaultThemePreferences;
    }
}

function getSystemDark() {
    if (typeof window === "undefined") {
        return false;
    }

    return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function getRadiusValue(radius: ThemeRadius) {
    return radius === "rounded" ? 12 : 8;
}

function getBgColor(resolvedAppearance: "light" | "dark") {
    return resolvedAppearance === "dark" ? "#0f172a" : "#f5f7fb";
}

function getSurfaceColor(resolvedAppearance: "light" | "dark") {
    return resolvedAppearance === "dark" ? "#111827" : "#ffffff";
}

function getTextColor(resolvedAppearance: "light" | "dark") {
    return resolvedAppearance === "dark" ? "#e5e7eb" : "#172033";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
    const [preferences, setPreferences] = useState<ThemePreferences>(() => readStoredTheme());
    const [systemDark, setSystemDark] = useState(() => getSystemDark());

    useEffect(() => {
        const media = window.matchMedia("(prefers-color-scheme: dark)");

        function handleChange(event: MediaQueryListEvent) {
            setSystemDark(event.matches);
        }

        media.addEventListener("change", handleChange);

        return () => {
            media.removeEventListener("change", handleChange);
        };
    }, []);

    const resolvedAppearance: "light" | "dark" =
        preferences.appearance === "system"
            ? systemDark
                ? "dark"
                : "light"
            : preferences.appearance;

    const monacoTheme: "light" | "vs-dark" =
        preferences.editorTheme === "system"
            ? resolvedAppearance === "dark"
                ? "vs-dark"
                : "light"
            : preferences.editorTheme === "dark"
                ? "vs-dark"
                : "light";

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    }, [preferences]);

    useEffect(() => {
        const root = document.documentElement;

        root.dataset.theme = resolvedAppearance;
        root.dataset.density = preferences.density;
        root.dataset.radius = preferences.radius;

        root.style.setProperty("--yoj-primary", preferences.primaryColor);
        root.style.setProperty("--yoj-radius", `${getRadiusValue(preferences.radius)}px`);
    }, [preferences, resolvedAppearance]);

    const themeConfig = useMemo<ThemeConfig>(() => {
        const algorithms = [
            resolvedAppearance === "dark"
                ? antdTheme.darkAlgorithm
                : antdTheme.defaultAlgorithm,
            preferences.density === "compact" ? antdTheme.compactAlgorithm : null
        ].filter(Boolean) as ThemeConfig["algorithm"][];

        return {
            algorithm: algorithms,
            token: {
                colorPrimary: preferences.primaryColor,
                colorInfo: preferences.primaryColor,
                colorLink: preferences.primaryColor,
                borderRadius: getRadiusValue(preferences.radius),
                colorBgBase: getBgColor(resolvedAppearance),
                colorTextBase: getTextColor(resolvedAppearance),
                fontFamily:
                    '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif'
            },
            components: {
                Layout: {
                    bodyBg: getBgColor(resolvedAppearance),
                    headerBg: getSurfaceColor(resolvedAppearance)
                },
                Button: {
                    borderRadius: getRadiusValue(preferences.radius)
                },
                Table: {
                    headerBg: resolvedAppearance === "dark" ? "#172033" : "#f8fafc"
                },
                Card: {
                    borderRadiusLG: getRadiusValue(preferences.radius) + 2
                }
            }
        };
    }, [preferences, resolvedAppearance]);

    function updateTheme(patch: Partial<ThemePreferences>) {
        setPreferences((current) => ({
            ...current,
            ...patch
        }));
    }

    function resetTheme() {
        setPreferences(defaultThemePreferences);
    }

    const value = useMemo<ThemeContextValue>(
        () => ({
            preferences,
            resolvedAppearance,
            monacoTheme,
            colorPresets: themeColorPresets,
            updateTheme,
            resetTheme
        }),
        [preferences, resolvedAppearance, monacoTheme]
    );

    return (
        <ThemeContext.Provider value={value}>
            <ConfigProvider locale={zhCN} theme={themeConfig}>
                {children}
            </ConfigProvider>
        </ThemeContext.Provider>
    );
}

export function useThemeSettings() {
    const value = useContext(ThemeContext);

    if (!value) {
        throw new Error("useThemeSettings must be used within ThemeProvider");
    }

    return value;
}