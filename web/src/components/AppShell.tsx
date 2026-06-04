import {
    CodeOutlined,
    DatabaseOutlined,
    LoginOutlined,
    LogoutOutlined,
    OrderedListOutlined,
    SettingOutlined,
    SkinOutlined,
    TrophyOutlined,
    UserAddOutlined,
    UserOutlined
} from "@ant-design/icons";
import type {MenuProps} from "antd";
import {Avatar, Button, Dropdown, Layout, Space, Typography} from "antd";
import {Outlet, useLocation, useNavigate} from "react-router-dom";
import {useAuth} from "../state/AuthContext";
import ThemeSettings from "./ThemeSettings";

const {Header, Content} = Layout;

export default function AppShell() {
    const location = useLocation();
    const navigate = useNavigate();
    const {user, logout} = useAuth();

    const navItems = [
        {
            key: "/",
            icon: <DatabaseOutlined/>,
            label: "题库",
            path: "/"
        },
        {
            key: "/contests",
            icon: <TrophyOutlined/>,
            label: "比赛",
            path: "/contests"
        },
        ...(user
            ? [
                {
                    key: "/submissions",
                    icon: <OrderedListOutlined/>,
                    label: "提交",
                    path: "/submissions"
                }
            ]
            : []),
        ...(user?.role === "admin"
            ? [
                {
                    key: "/admin",
                    icon: <SettingOutlined/>,
                    label: "管理",
                    path: "/admin/dashboard"
                }
            ]
            : [])
    ];

    const activeKey = location.pathname.startsWith("/contests")
        ? "/contests"
        : location.pathname.startsWith("/submissions")
            ? "/submissions"
            : location.pathname.startsWith("/admin")
                ? "/admin"
                : "/";


    const userMenu: MenuProps["items"] = [
        {
            key: "theme",
            type: "item",
            icon: <SkinOutlined/>,
            label: <ThemeSettings/>,
        },
        {
            type: "divider"
        },
        {
            key: "logout",
            type: "item",
            icon: <LogoutOutlined/>,
            label: "退出登录",
            onClick: () => {
                logout();
                navigate("/");
            }
        }
    ];

    return (
        <Layout className="app-layout">
            <Header className="app-header">
                <button className="brand" type="button" onClick={() => navigate("/")}>
          <span className="brand-mark">
            <CodeOutlined/>
          </span>
                    <span>
            <Typography.Text strong className="brand-name">
              yoj
            </Typography.Text>
            <Typography.Text className="brand-subtitle">Online Judge</Typography.Text>
          </span>
                </button>

                <nav className="main-nav">
                    {navItems.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            className={`main-nav-item ${activeKey === item.key ? "is-active" : ""}`}
                            onClick={() => navigate(item.path)}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </nav>

                <Space className="header-actions">
                    {user ? (
                        <Dropdown menu={{items: userMenu}} trigger={["click"]}>
                            <Button variant={"link"} color={"default"} className="user-chip">
                                <Avatar size="small" icon={<UserOutlined/>}/>
                                {user.username}
                            </Button>
                        </Dropdown>
                    ) : (
                        <>
                            <Button icon={<LoginOutlined/>} onClick={() => navigate("/login")}>
                                登录
                            </Button>

                            <Button type="primary" icon={<UserAddOutlined/>} onClick={() => navigate("/register")}>
                                注册
                            </Button>
                        </>
                    )}
                </Space>
            </Header>

            <Content className="app-content">
                <Outlet/>
            </Content>
        </Layout>
    );
}