import {
  CodeOutlined,
  DatabaseOutlined,
  LoginOutlined,
  LogoutOutlined,
  OrderedListOutlined,
  SettingOutlined,
  TrophyOutlined,
  UserAddOutlined,
  UserOutlined
} from "@ant-design/icons";
import {Avatar, Button, Dropdown, InputNumber, Layout, Space, Typography} from "antd";
import type { MenuProps } from "antd";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

const { Header, Content } = Layout;

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const navItems = [
    { key: "/", icon: <DatabaseOutlined />, label: "题库", path: "/" },
    { key: "/contests", icon: <TrophyOutlined />, label: "比赛", path: "/contests" },
    ...(user ? [{ key: "/submissions", icon: <OrderedListOutlined />, label: "提交", path: "/submissions" }] : []),
    ...(user?.role === "admin" ? [{ key: "/admin", icon: <SettingOutlined />, label: "管理", path: "/admin/dashboard" }] : [])
  ];

  const activeKey = location.pathname.startsWith("/contests")
    ? "/contests"
    : location.pathname.startsWith("/submissions")
      ? "/submissions"
      : location.pathname.startsWith("/admin")
        ? "/admin"
        : "/";

  const userMenu: MenuProps["items"] = [
      user?.role !== "admin" ? null : {
      key: "admin",
      icon: <SettingOutlined />,
      label: "管理后台",
      onClick: () => navigate("/admin/dashboard"),
    } ,
    {
      type: "divider"
    },
    {
      key: "logout",
      icon: <LogoutOutlined />,
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
            <CodeOutlined />
          </span>
          <span>
            <Typography.Text strong className="brand-name">
              yoj
            </Typography.Text>
            <span className="brand-subtitle">Online Judge</span>
          </span>
        </button>

        <nav className="main-nav" aria-label="主导航">
          {navItems.map((item) => (
            <button
              key={item.key}
              type="button"
              className={activeKey === item.key ? "main-nav-item is-active" : "main-nav-item"}
              onClick={() => navigate(item.path)}
            >
              {item.icon}
              <span>{item.label}</span>
            </button>
          ))}
        </nav>

        <Space className="header-actions" size={10}>
          {user ? (
            <Dropdown menu={{ items: userMenu }} trigger={["click"]}>
              <Button className="user-chip">
                <Avatar size={24} icon={<UserOutlined />} />
                <span>{user.username}</span>
              </Button>
            </Dropdown>
          ) : (
            <>
              <Button icon={<LoginOutlined />} onClick={() => navigate("/login")}>
                登录
              </Button>
              <Button type="primary" icon={<UserAddOutlined />} onClick={() => navigate("/register")}>
                注册
              </Button>
            </>
          )}
        </Space>
      </Header>
      <Content className="app-content">
        <Outlet />
      </Content>
    </Layout>
  );
}
