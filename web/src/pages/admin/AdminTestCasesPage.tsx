import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Checkbox, Form, Input, InputNumber, message, Modal, Popconfirm, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Problem, request, TestCase } from "../../api/client";
import AdminNav from "../../components/AdminNav";

interface TestCaseFormValues {
  input: string;
  expected_output: string;
  is_sample: boolean;
  sort_order: number;
}

export default function AdminTestCasesPage() {
  const { id } = useParams();
  const [problem, setProblem] = useState<Problem>();
  const [cases, setCases] = useState<TestCase[]>([]);
  const [editing, setEditing] = useState<TestCase | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<TestCaseFormValues>();

  async function load() {
    const [problemData, casesData] = await Promise.all([
      request<{ problem: Problem }>(`/admin/problems/${id}`),
      request<{ items: TestCase[] }>(`/admin/problems/${id}/test-cases`)
    ]);
    setProblem(problemData.problem);
    setCases(casesData.items);
  }

  useEffect(() => {
    void load();
  }, [id]);

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({ input: "", expected_output: "", is_sample: false, sort_order: cases.length + 1 });
    setOpen(true);
  }

  function openEdit(row: TestCase) {
    setEditing(row);
    form.setFieldsValue(row);
    setOpen(true);
  }

  async function save() {
    const values = await form.validateFields();
    try {
      if (editing) {
        await request(`/admin/test-cases/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(values)
        });
        message.success("测试点已更新");
      } else {
        await request(`/admin/problems/${id}/test-cases`, {
          method: "POST",
          body: JSON.stringify(values)
        });
        message.success("测试点已创建");
      }
      setOpen(false);
      await load();
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  async function remove(row: TestCase) {
    try {
      await request(`/admin/test-cases/${row.id}`, { method: "DELETE" });
      message.success("已删除");
      await load();
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  const columns: ColumnsType<TestCase> = [
    {
      title: "顺序",
      dataIndex: "sort_order",
      width: 80
    },
    {
      title: "输入",
      dataIndex: "input",
      render: (value: string) => <pre className="table-pre">{value}</pre>
    },
    {
      title: "期望输出",
      dataIndex: "expected_output",
      render: (value: string) => <pre className="table-pre">{value}</pre>
    },
    {
      title: "样例",
      dataIndex: "is_sample",
      width: 90,
      render: (value: boolean) => (value ? "是" : "否")
    },
    {
      title: "操作",
      width: 140,
      render: (_, row) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openEdit(row)} />
          <Popconfirm title="确认删除该测试点？" onConfirm={() => remove(row)}>
            <Button danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <main className="page-stack">
      <AdminNav />
      <div className="page-title-row">
        <div>
          <Typography.Title level={2}>测试点管理</Typography.Title>
          <Typography.Text type="secondary">{problem?.title}</Typography.Text>
        </div>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建测试点
        </Button>
      </div>
      <Table rowKey="id" columns={columns} dataSource={cases} pagination={false} />
      <Modal title={editing ? "编辑测试点" : "新建测试点"} open={open} onOk={save} onCancel={() => setOpen(false)}>
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item name="input" label="输入">
            <Input.TextArea rows={5} />
          </Form.Item>
          <Form.Item name="expected_output" label="期望输出" rules={[{ required: true, message: "请输入期望输出" }]}>
            <Input.TextArea rows={5} />
          </Form.Item>
          <Form.Item name="sort_order" label="顺序">
            <InputNumber min={0} className="full-width" />
          </Form.Item>
          <Form.Item name="is_sample" valuePropName="checked">
            <Checkbox>作为样例展示</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
