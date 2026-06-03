import { Button, Segmented, Select, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { buildQuery, ListResponse, request, Submission } from "../api/client";
import { statusColor } from "../utils/status";

type Scope = "all" | "mine";

export default function SubmissionsPage() {
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [status, setStatus] = useState<string>();
  const [language, setLanguage] = useState<string>();
  const [data, setData] = useState<ListResponse<Submission>>({ items: [], total: 0, page: 1, page_size: 20 });

  async function load(page = 1) {
    setLoading(true);
    try {
      const query = buildQuery({
        page,
        page_size: data.page_size,
        status,
        language,
        mine: scope === "mine" ? 1 : undefined
      });
      const next = await request<ListResponse<Submission>>(`/submissions${query}`);
      setData(next);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, [scope]);

  const columns: ColumnsType<Submission> = [
    {
      title: "提交",
      dataIndex: "id",
      width: 96,
      render: (id: number) => <Link to={`/submissions/${id}`}>#{id}</Link>
    },
    {
      title: "题目",
      render: (_, row) => <Link to={`/problems/${row.problem.id}`}>{row.problem.title}</Link>
    },
    {
      title: "用户",
      dataIndex: ["user", "username"],
      width: 130
    },
    {
      title: "语言",
      dataIndex: "language",
      width: 100,
      render: (value: string) => <span className="code-lang">{value}</span>
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 180,
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
    }
  ];

  return (
    <main className="page-stack">
      <section className="page-hero compact">
        <div>
          <Typography.Text className="eyebrow">Submissions</Typography.Text>
          <Typography.Title level={1}>提交记录</Typography.Title>
          <Typography.Paragraph>查看全部提交状态；代码内容仅提交者本人可见。</Typography.Paragraph>
        </div>
        <Segmented
          value={scope}
          onChange={(value) => setScope(value as Scope)}
          options={[
            { label: "全部", value: "all" },
            { label: "我的", value: "mine" }
          ]}
        />
      </section>
      <section className="toolbar submissions-toolbar surface-toolbar">
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
        <Button type="primary" onClick={() => load(1)}>
          查询
        </Button>
      </section>
      <section className="surface table-surface">
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
      </section>
    </main>
  );
}
