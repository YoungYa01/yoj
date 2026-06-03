import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Form, Input, message, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

export default function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();

  async function onFinish(values: { username: string; password: string }) {
    try {
      await login(values.username, values.password);
      message.success("登录成功");
      navigate("/");
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Typography.Text className="eyebrow">Welcome Back</Typography.Text>
        <Typography.Title level={2}>登录 yoj</Typography.Title>
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: "请输入用户名" }]}>
            <Input autoFocus prefix={<UserOutlined />} />
          </Form.Item>
          <Form.Item name="password" label="密码" rules={[{ required: true, message: "请输入密码" }]}>
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            登录
          </Button>
        </Form>
      </section>
    </main>
  );
}
