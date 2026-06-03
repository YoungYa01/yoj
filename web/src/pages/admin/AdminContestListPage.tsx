import { DeleteOutlined, EditOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Input, message, Popconfirm, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { buildQuery, Contest, ListResponse, request } from "../../api/client";
import AdminNav from "../../components/AdminNav";

const statusMeta: Record<string, { label: string; color: string }> = {
  upcoming: { label: "未开始", color: "blue" },
  running: { label: "进行中", color: "green" },
  ended: { label: "已结束", color: "default" }
};

export default function AdminContestListPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [data, setData] = useState<ListResponse<Contest>>({ items: [], total: 0, page: 1, page_size: 20 });

  async function load(page = 1) {
    setLoading(true);
    try {
      const query = buildQuery({ page, page_size: data.page_size, keyword });
      const next = await request<ListResponse<Contest>>(`/admin/contests${query}`);
      setData(next);
    } finally {
      setLoading(false);
    }
  }

  async function remove(id: number) {
    try {
      await request(`/admin/contests/${id}`, { method: "DELETE" });
      message.success("比赛已删除");
      await load(data.page);
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  const columns: ColumnsType<Contest> = [
    {
      title: "ID",
      dataIndex: "id",
      width: 80
    },
    {
      title: "比赛",
      render: (_, row) => <Link to={`/contests/${row.id}`}>{row.title}</Link>
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => <Tag color={statusMeta[value]?.color}>{statusMeta[value]?.label ?? value}</Tag>
    },
    {
      title: "公开",
      dataIndex: "is_public",
      width: 90,
      render: (value: boolean) => (value ? <Tag color="green">公开</Tag> : <Tag>私有</Tag>)
    },
    {
      title: "题目",
      dataIndex: "problem_count",
      width: 90
    },
    {
      title: "报名",
      dataIndex: "participant_count",
      width: 90
    },
    {
      title: "开始",
      dataIndex: "start_time",
      width: 180
    },
    {
      title: "操作",
      width: 160,
      render: (_, row) => (
        <Space>
          <Button icon={<EditOutlined />} onClick={() => navigate(`/admin/contests/${row.id}/edit`)}></Button>
          <Popconfirm title="确认删除该比赛？" onConfirm={() => remove(row.id)}>
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
        <Typography.Title level={2}>比赛管理</Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/admin/contests/new")}>
          新建比赛
        </Button>
      </div>
      <section className="toolbar">
        <Input
          allowClear
          placeholder="搜索比赛"
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
    </main>
  );
}
