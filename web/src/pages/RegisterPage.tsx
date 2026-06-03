import { LockOutlined, UserOutlined } from "@ant-design/icons";
import { Button, Form, Input, message, Typography } from "antd";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../state/AuthContext";

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  async function onFinish(values: { username: string; password: string }) {
    try {
      await register(values.username, values.password);
      message.success("注册成功");
      navigate("/");
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <Typography.Text className="eyebrow">Create Account</Typography.Text>
        <Typography.Title level={2}>注册账号</Typography.Title>
        <Form layout="vertical" onFinish={onFinish} requiredMark={false}>
          <Form.Item
            name="username"
            label="用户名"
            rules={[
              { required: true, message: "请输入用户名" },
              { min: 3, max: 32, message: "用户名长度为 3-32 个字符" }
            ]}
          >
            <Input autoFocus prefix={<UserOutlined />} />
          </Form.Item>
          <Form.Item
            name="password"
            label="密码"
            rules={[
              { required: true, message: "请输入密码" },
              { min: 6, message: "密码至少 6 位" }
            ]}
          >
            <Input.Password prefix={<LockOutlined />} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            注册
          </Button>
        </Form>
      </section>
    </main>
  );
}
