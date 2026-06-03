import {
    BgColorsOutlined,
    CheckOutlined,
    DesktopOutlined,
    MoonOutlined,
    RadiusSettingOutlined,
    ReloadOutlined,
    SkinOutlined,
    SunOutlined
} from "@ant-design/icons";
import { Button, Drawer, Segmented, Space, Typography } from "antd";
import { useState } from "react";
import { useThemeSettings } from "../state/ThemeContext";

export default function ThemeSettings() {
    const [open, setOpen] = useState(false);
    const {
        preferences,
        resolvedAppearance,
        colorPresets,
        updateTheme,
        resetTheme
    } = useThemeSettings();

    return (
        <>
            <div onClick={() => setOpen(true)}>
                主题设置
            </div>

            <Drawer
                title="主题设置"
                width={360}
                open={open}
                onClose={() => setOpen(false)}
                className="theme-settings-drawer"
            >
                <Space direction="vertical" size={22} className="full-width">
                    <section className="theme-setting-section">
                        <div className="theme-setting-title">
                            <BgColorsOutlined />
                            <span>外观</span>
                        </div>

                        <Segmented
                            block
                            value={preferences.appearance}
                            onChange={(value) => updateTheme({ appearance: value as never })}
                            options={[
                                {
                                    label: (
                                        <span className="theme-segment-label">
                      <SunOutlined />
                      亮色
                    </span>
                                    ),
                                    value: "light"
                                },
                                {
                                    label: (
                                        <span className="theme-segment-label">
                      <MoonOutlined />
                      暗色
                    </span>
                                    ),
                                    value: "dark"
                                },
                                {
                                    label: (
                                        <span className="theme-segment-label">
                      <DesktopOutlined />
                      系统
                    </span>
                                    ),
                                    value: "system"
                                }
                            ]}
                        />

                        <Typography.Text type="secondary" className="theme-setting-help">
                            当前实际外观：{resolvedAppearance === "dark" ? "暗色" : "亮色"}
                        </Typography.Text>
                    </section>

                    <section className="theme-setting-section">
                        <div className="theme-setting-title">
                            <SkinOutlined />
                            <span>主色</span>
                        </div>

                        <div className="theme-color-grid">
                            {colorPresets.map((item) => {
                                const active = preferences.primaryColor === item.color;

                                return (
                                    <button
                                        key={item.key}
                                        type="button"
                                        className={active ? "theme-color-card is-active" : "theme-color-card"}
                                        onClick={() => updateTheme({ primaryColor: item.color })}
                                    >
                    <span
                        className="theme-color-dot"
                        style={{ backgroundColor: item.color }}
                    />

                                        <span>{item.name}</span>

                                        {active && <CheckOutlined />}
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    <section className="theme-setting-section">
                        <div className="theme-setting-title">
                            <RadiusSettingOutlined />
                            <span>显示密度</span>
                        </div>

                        <Segmented
                            block
                            value={preferences.density}
                            onChange={(value) => updateTheme({ density: value as never })}
                            options={[
                                { label: "舒适", value: "comfortable" },
                                { label: "紧凑", value: "compact" }
                            ]}
                        />
                    </section>

                    <section className="theme-setting-section">
                        <div className="theme-setting-title">
                            <RadiusSettingOutlined />
                            <span>圆角风格</span>
                        </div>

                        <Segmented
                            block
                            value={preferences.radius}
                            onChange={(value) => updateTheme({ radius: value as never })}
                            options={[
                                { label: "标准", value: "standard" },
                                { label: "圆润", value: "rounded" }
                            ]}
                        />
                    </section>

                    <section className="theme-setting-section">
                        <div className="theme-setting-title">
                            <DesktopOutlined />
                            <span>代码编辑器</span>
                        </div>

                        <Segmented
                            block
                            value={preferences.editorTheme}
                            onChange={(value) => updateTheme({ editorTheme: value as never })}
                            options={[
                                { label: "系统", value: "system" },
                                { label: "浅色", value: "light" },
                                { label: "深色", value: "dark" }
                            ]}
                        />
                    </section>

                    <Button block icon={<ReloadOutlined />} onClick={resetTheme}>
                        恢复默认主题
                    </Button>
                </Space>
            </Drawer>
        </>
    );
}