import { RedoOutlined } from "@ant-design/icons";
import { Button, InputNumber, message, Popconfirm, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { buildQuery, ListResponse, request, Submission } from "../../api/client";
import AdminNav from "../../components/AdminNav";
import { statusColor } from "../../utils/status";

export default function AdminSubmissionsPage() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>();
  const [language, setLanguage] = useState<string>();
  const [userID, setUserID] = useState<number | undefined>(() => {
    const value = Number(searchParams.get("user_id"));
    return value > 0 ? value : undefined;
  });
  const [problemID, setProblemID] = useState<number | undefined>();
  const [data, setData] = useState<ListResponse<Submission>>({ items: [], total: 0, page: 1, page_size: 20 });

  async function load(page = 1) {
    setLoading(true);
    try {
      const query = buildQuery({
        page,
        page_size: data.page_size,
        status,
        language,
        user_id: userID,
        problem_id: problemID
      });
      const next = await request<ListResponse<Submission>>(`/admin/submissions${query}`);
      setData(next);
    } finally {
      setLoading(false);
    }
  }

  async function rejudge(row: Submission) {
    try {
      await request(`/admin/submissions/${row.id}/rejudge`, { method: "POST" });
      message.success("已重新加入判题队列");
      await load(data.page);
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  const columns: ColumnsType<Submission> = [
    {
      title: "ID",
      dataIndex: "id",
      width: 80,
      render: (id: number) => <Link to={`/submissions/${id}`}>#{id}</Link>
    },
    {
      title: "题目",
      render: (_, row) => <Link to={`/problems/${row.problem.id}`}>{row.problem.title}</Link>
    },
    {
      title: "用户",
      render: (_, row) => (
        <Button type="link" className="link-button" onClick={() => setUserID(row.user.id)}>
          {row.user.username}
        </Button>
      )
    },
    {
      title: "语言",
      dataIndex: "language",
      width: 100
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 170,
      render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>
    },
    {
      title: "耗时",
      dataIndex: "time_used_ms",
      width: 100,
      render: (value: number) => `${value} ms`
    },
    {
      title: "提交时间",
      dataIndex: "created_at",
      width: 180
    },
    {
      title: "操作",
      width: 110,
      render: (_, row) => (
        <Popconfirm title="确认重判这条提交？" onConfirm={() => rejudge(row)}>
          <Button icon={<RedoOutlined />}>重判</Button>
        </Popconfirm>
      )
    }
  ];

  return (
    <main className="page-stack">
      <AdminNav />
      <div className="page-title-row">
        <Typography.Title level={2}>提交管理</Typography.Title>
      </div>
      <section className="toolbar admin-submission-toolbar">
        <Select
          allowClear
          placeholder="状态"
          value={status}
          onChange={setStatus}
          options={[
            "Pending",
            "Judging",
            "Accepted",
            "Wrong Answer",
            "Compile Error",
            "Runtime Error",
            "Time Limit Exceeded",
            "Memory Limit Exceeded",
            "System Error"
          ].map((value) => ({ label: value, value }))}
        />
        <Select
          allowClear
          placeholder="语言"
          value={language}
          onChange={setLanguage}
          options={[
            { label: "Go", value: "go" },
            { label: "C", value: "c" },
            { label: "C++", value: "cpp" },
            { label: "Python", value: "python" }
          ]}
        />
        <InputNumber min={1} placeholder="用户 ID" value={userID} onChange={(value) => setUserID(value ?? undefined)} />
        <InputNumber
          min={1}
          placeholder="题目 ID"
          value={problemID}
          onChange={(value) => setProblemID(value ?? undefined)}
        />
        <Space>
          <Button type="primary" onClick={() => load(1)}>
            筛选
          </Button>
          <Button
            onClick={() => {
              setStatus(undefined);
              setLanguage(undefined);
              setUserID(undefined);
              setProblemID(undefined);
            }}
          >
            重置
          </Button>
        </Space>
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
