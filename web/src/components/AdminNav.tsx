import {
  DashboardOutlined,
  FileSearchOutlined,
  TagsOutlined,
  TeamOutlined,
  TrophyOutlined,
  UnorderedListOutlined
} from "@ant-design/icons";
import { Segmented } from "antd";
import { useLocation, useNavigate } from "react-router-dom";

export default function AdminNav() {
  const location = useLocation();
  const navigate = useNavigate();

  const activeKey = location.pathname.startsWith("/admin/contests")
    ? "/admin/contests"
    : location.pathname.startsWith("/admin/submissions")
      ? "/admin/submissions"
      : location.pathname.startsWith("/admin/tags")
        ? "/admin/tags"
        : location.pathname.startsWith("/admin/users")
          ? "/admin/users"
          : location.pathname.startsWith("/admin/problems")
            ? "/admin/problems"
            : "/admin/dashboard";

  return (
    <div className="admin-nav">
      <Segmented
        value={activeKey}
        onChange={(value) => navigate(value as string)}
        options={[
          { value: "/admin/dashboard", label: "概览", icon: <DashboardOutlined /> },
          { value: "/admin/problems", label: "题目", icon: <UnorderedListOutlined /> },
          { value: "/admin/contests", label: "比赛", icon: <TrophyOutlined /> },
          { value: "/admin/tags", label: "标签", icon: <TagsOutlined /> },
          { value: "/admin/submissions", label: "提交", icon: <FileSearchOutlined /> },
          { value: "/admin/users", label: "用户", icon: <TeamOutlined /> }
        ]}
      />
    </div>
  );
}
