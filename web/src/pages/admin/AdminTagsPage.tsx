import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from "@ant-design/icons";
import { Button, Form, Input, message, Modal, Popconfirm, Space, Table, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { AdminTag, buildQuery, ListResponse, request } from "../../api/client";
import AdminNav from "../../components/AdminNav";

interface TagFormValues {
  name: string;
}

export default function AdminTagsPage() {
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [data, setData] = useState<ListResponse<AdminTag>>({ items: [], total: 0, page: 1, page_size: 20 });
  const [editing, setEditing] = useState<AdminTag | null>(null);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm<TagFormValues>();

  async function load(page = 1) {
    setLoading(true);
    try {
      const query = buildQuery({ page, page_size: data.page_size, keyword });
      const next = await request<ListResponse<AdminTag>>(`/admin/tags${query}`);
      setData(next);
    } finally {
      setLoading(false);
    }
  }

  function openCreate() {
    setEditing(null);
    form.setFieldsValue({ name: "" });
    setOpen(true);
  }

  function openEdit(row: AdminTag) {
    setEditing(row);
    form.setFieldsValue({ name: row.name });
    setOpen(true);
  }

  async function save() {
    const values = await form.validateFields();
    try {
      if (editing) {
        await request(`/admin/tags/${editing.id}`, {
          method: "PUT",
          body: JSON.stringify(values)
        });
        message.success("标签已更新");
      } else {
        await request("/admin/tags", {
          method: "POST",
          body: JSON.stringify(values)
        });
        message.success("标签已创建");
      }
      setOpen(false);
      await load(data.page);
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  async function remove(row: AdminTag) {
    try {
      await request(`/admin/tags/${row.id}`, { method: "DELETE" });
      message.success("标签已删除");
      await load(data.page);
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  const columns: ColumnsType<AdminTag> = [
    {
      title: "ID",
      dataIndex: "id",
      width: 80
    },
    {
      title: "标签",
      dataIndex: "name"
    },
    {
      title: "关联题目",
      dataIndex: "problem_count",
      width: 120
    },
    {
      title: "创建时间",
      dataIndex: "created_at",
      width: 180
    },
    {
      title: "操作",
      width: 130,
      render: (_, row) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => openEdit(row)} />
          <Popconfirm title="删除标签会解除题目关联，确认删除？" onConfirm={() => remove(row)}>
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
        <Typography.Title level={2}>标签管理</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
          新建标签
        </Button>
      </div>
      <section className="toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索标签"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onPressEnter={() => load(1)}
        />
        <span />
        <Button type="primary" onClick={() => load(1)}>
          筛选
        </Button>
      </section>
      <Table
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={data.items}
        pagination={{
          current: data.page,
          total: data.total,
          pageSize: data.page_size,
          onChange: (page) => load(page)
        }}
      />
      <Modal title={editing ? "编辑标签" : "新建标签"} open={open} onOk={save} onCancel={() => setOpen(false)}>
        <Form form={form} layout="vertical" requiredMark={false}>
          <Form.Item
            name="name"
            label="名称"
            rules={[
              { required: true, message: "请输入标签名称" },
              { max: 64, message: "标签名称不能超过 64 个字符" }
            ]}
          >
            <Input autoFocus />
          </Form.Item>
        </Form>
      </Modal>
    </main>
  );
}
