import { Button, Checkbox, Form, Input, InputNumber, message, Select, Space, Typography } from "antd";
import { useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Problem, request } from "../../api/client";
import AdminNav from "../../components/AdminNav";

interface ProblemFormValues {
  title: string;
  slug: string;
  description: string;
  input_description?: string;
  output_description?: string;
  difficulty: string;
  time_limit_ms: number;
  memory_limit_mb: number;
  hint?: string;
  is_published: boolean;
  tags?: string;
}

export default function AdminProblemFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm<ProblemFormValues>();
  const isEdit = Boolean(id);

  useEffect(() => {
    async function load() {
      if (!id) {
        form.setFieldsValue({
          difficulty: "Easy",
          time_limit_ms: 1000,
          memory_limit_mb: 128,
          is_published: true
        });
        return;
      }
      const data = await request<{ problem: Problem }>(`/admin/problems/${id}`);
      form.setFieldsValue({
        ...data.problem,
        tags: data.problem.tags.map((tag) => tag.name).join(", ")
      });
    }
    void load();
  }, [id, form]);

  async function onFinish(values: ProblemFormValues) {
    const payload = {
      ...values,
      tags: values.tags
        ?.split(",")
        .map((tag) => tag.trim())
        .filter(Boolean)
    };
    try {
      if (isEdit) {
        await request(`/admin/problems/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        message.success("题目已更新");
      } else {
        const data = await request<{ problem: Problem }>("/admin/problems", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        message.success("题目已创建");
        navigate(`/admin/problems/${data.problem.id}/test-cases`);
        return;
      }
      navigate("/admin/problems");
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  return (
    <main className="page-stack">
      <AdminNav />
      <div className="page-title-row">
        <Typography.Title level={2}>{isEdit ? "编辑题目" : "新建题目"}</Typography.Title>
      </div>
      <section className="surface form-surface">
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <div className="form-grid">
            <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
              <Input />
            </Form.Item>
            <Form.Item name="slug" label="Slug" rules={[{ required: true, message: "请输入 slug" }]}>
              <Input />
            </Form.Item>
            <Form.Item name="difficulty" label="难度">
              <Select
                options={[
                  { label: "Easy", value: "Easy" },
                  { label: "Medium", value: "Medium" },
                  { label: "Hard", value: "Hard" }
                ]}
              />
            </Form.Item>
            <Form.Item name="tags" label="标签">
              <Input placeholder="多个标签用英文逗号分隔" />
            </Form.Item>
            <Form.Item name="time_limit_ms" label="时间限制 ms">
              <InputNumber min={100} step={100} className="full-width" />
            </Form.Item>
            <Form.Item name="memory_limit_mb" label="内存限制 MB">
              <InputNumber min={32} step={32} className="full-width" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="题面" rules={[{ required: true, message: "请输入题面" }]}>
            <Input.TextArea rows={8} />
          </Form.Item>
          <Form.Item name="input_description" label="输入格式">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="output_description" label="输出格式">
            <Input.TextArea rows={4} />
          </Form.Item>
          <Form.Item name="hint" label="提示">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="is_published" valuePropName="checked">
            <Checkbox>发布题目</Checkbox>
          </Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              保存
            </Button>
            <Button onClick={() => navigate("/admin/problems")}>取消</Button>
          </Space>
        </Form>
      </section>
    </main>
  );
}
