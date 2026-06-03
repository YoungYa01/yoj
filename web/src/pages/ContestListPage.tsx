import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { buildQuery, Contest, ListResponse, request } from "../api/client";

const statusMeta: Record<string, { label: string; color: string }> = {
  upcoming: { label: "未开始", color: "blue" },
  running: { label: "进行中", color: "green" },
  ended: { label: "已结束", color: "default" }
};

export default function ContestListPage() {
  const [loading, setLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState<string>();
  const [data, setData] = useState<ListResponse<Contest>>({ items: [], total: 0, page: 1, page_size: 20 });

  async function load(page = 1) {
    setLoading(true);
    try {
      const query = buildQuery({ page, page_size: data.page_size, keyword, status });
      const next = await request<ListResponse<Contest>>(`/contests${query}`);
      setData(next);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load(1);
  }, []);

  const columns: ColumnsType<Contest> = [
    {
      title: "比赛",
      render: (_, row) => (
        <div className="problem-title-cell">
          <Link to={`/contests/${row.id}`} className="problem-title-link">
            {row.title}
          </Link>
          <Typography.Text type="secondary" className="problem-slug">
            {row.is_public ? "公开赛" : "私有赛"}
          </Typography.Text>
        </div>
      )
    },
    {
      title: "状态",
      dataIndex: "status",
      width: 110,
      render: (value: string) => <Tag color={statusMeta[value]?.color}>{statusMeta[value]?.label ?? value}</Tag>
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
      title: "开始时间",
      dataIndex: "start_time",
      width: 180
    },
    {
      title: "结束时间",
      dataIndex: "end_time",
      width: 180
    },
    {
      title: "报名状态",
      width: 110,
      render: (_, row) => (row.joined ? <Tag color="green">已报名</Tag> : <Tag>未报名</Tag>)
    }
  ];

  return (
    <main className="page-stack">
      <section className="page-hero compact">
        <div>
          <Typography.Text className="eyebrow">Contests</Typography.Text>
          <Typography.Title level={1}>比赛</Typography.Title>
          <Typography.Paragraph>参加限时练习，查看榜单和赛题进度。</Typography.Paragraph>
        </div>
      </section>
      <section className="toolbar surface-toolbar">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索比赛"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          onPressEnter={() => load(1)}
        />
        <Select
          allowClear
          placeholder="状态"
          value={status}
          onChange={setStatus}
          options={[
            { label: "未开始", value: "upcoming" },
            { label: "进行中", value: "running" },
            { label: "已结束", value: "ended" }
          ]}
        />
        <Space>
          <Button type="primary" onClick={() => load(1)}>
            查询
          </Button>
        </Space>
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
