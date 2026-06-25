import {
    CodeOutlined,
    DatabaseOutlined,
    LoginOutlined,
    LogoutOutlined,
    OrderedListOutlined,
    ProfileOutlined,
    SettingOutlined,
    TrophyOutlined,
    UserAddOutlined,
    UserOutlined
} from "@ant-design/icons";
import {Avatar, Button, Dropdown, Flex, Layout, MenuProps, Typography} from "antd";
import {Outlet, useLocation, useNavigate} from "react-router-dom";
import {useAuth} from "../state/AuthContext";
import ThemeSettings from "./ThemeSettings";


const {Header, Content, Footer} = Layout;

export default function AppShell() {
    const location = useLocation();
    const navigate = useNavigate();
    const {user, logout} = useAuth();

    const displayName = user?.nickname || user?.username;

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
    ];

    const activeKey = location.pathname.startsWith("/contests")
        ? "/contests"
        : location.pathname.startsWith("/submissions")
            ? "/submissions"
            : location.pathname.startsWith("/admin")
                ? "/admin"
                : "/";

    const userMenu: MenuProps["items"] = [
        ...(user?.role === "admin"
            ? [
                {
                    key: "admin",
                    type: "item" as const,
                    icon: <SettingOutlined/>,
                    label: "管理后台",
                    onClick: () => navigate("/admin/dashboard")
                },
                {
                    type: "divider" as const
                }
            ]
            : []),
        {
            key: "profile",
            icon: <ProfileOutlined/>,
            label: "个人中心",
            onClick: () => navigate("/profile")
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

                <nav className="main-nav" aria-label="主导航">
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

                <Flex gap={20} className="header-actions">
                    <ThemeSettings/>

                    {user ? (
                        <Dropdown menu={{items: userMenu}} trigger={["click"]}>
                            <Button className="user-chip">
                                <Avatar size="small"
                                        src={import.meta.env["VITE_API_URL"] + user.avatar_url || undefined}
                                        icon={<UserOutlined/>}/>
                                {displayName}
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
                </Flex>
            </Header>

            <Content className="app-content">
                <Outlet/>
            </Content>
        </Layout>
    );
}
