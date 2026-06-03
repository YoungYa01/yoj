import {
  CheckCircleFilled,
  ClockCircleOutlined,
  FilterOutlined,
  SearchOutlined,
  TagsOutlined
} from "@ant-design/icons";
import { Button, Input, Progress, Select, Space, Table, Tag, Tooltip, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { buildQuery, ListResponse, Problem, PublicTag, request } from "../api/client";
import { useAuth } from "../state/AuthContext";

const difficultyMeta: Record<string, { label: string; className: string }> = {
  Easy: { label: "入门", className: "difficulty-easy" },
  Medium: { label: "进阶", className: "difficulty-medium" },
  Hard: { label: "挑战", className: "difficulty-hard" }
};

type ProblemFilters = {
  keyword: string;
  difficulty?: string;
  tag?: string;
  status?: string;
};

function statusBadge(problem: Problem) {
  if (problem.accepted) {
    return (
      <Tooltip title="已通过">
        <span className="problem-status-badge is-accepted">
          <CheckCircleFilled />
          AC
        </span>
      </Tooltip>
    );
  }
  if (problem.attempted) {
    return (
      <Tooltip title="已尝试，尚未通过">
        <span className="problem-status-badge is-attempted">
          <ClockCircleOutlined />
          TRY
        </span>
      </Tooltip>
    );
  }
  return <span className="problem-status-badge">-</span>;
}

export default function ProblemListPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [tags, setTags] = useState<PublicTag[]>([]);
  const [filters, setFilters] = useState<ProblemFilters>({ keyword: "" });
  const [data, setData] = useState<ListResponse<Problem>>({ items: [], total: 0, page: 1, page_size: 30 });

  async function load(page = 1, nextFilters = filters) {
    setLoading(true);
    try {
      const query = buildQuery({
        page,
        page_size: data.page_size,
        keyword: nextFilters.keyword.trim(),
        difficulty: nextFilters.difficulty,
        tag: nextFilters.tag,
        status: user ? nextFilters.status : undefined
      });
      const next = await request<ListResponse<Problem>>(`/problems${query}`);
      setData(next);
    } finally {
      setLoading(false);
    }
  }

  async function loadTags() {
    const data = await request<{ items: PublicTag[] }>("/tags");
    setTags(data.items);
  }

  function applyFilter(patch: Partial<ProblemFilters>) {
    const next = { ...filters, ...patch };
    setFilters(next);
    void load(1, next);
  }

  function resetFilters() {
    const next = { keyword: "" };
    setFilters(next);
    void load(1, next);
  }

  useEffect(() => {
    void loadTags();
    void load(1);
  }, []);

  const pageStats = useMemo(() => {
    const accepted = data.items.filter((item) => item.accepted).length;
    const attempted = data.items.filter((item) => item.attempted && !item.accepted).length;
    return { accepted, attempted };
  }, [data.items]);

  const columns: ColumnsType<Problem> = [
    {
      title: "状态",
      width: 92,
      render: (_, row) => statusBadge(row)
    },
    {
      title: "题目",
      render: (_, row) => (
        <div className="problem-title-cell">
          <Link to={`/problems/${row.id}`} className="problem-title-link">
            <span className="problem-id">#{row.id}</span>
            {row.title}
          </Link>
          <Typography.Text type="secondary" className="problem-slug">
            {row.slug}
          </Typography.Text>
        </div>
      )
    },
    {
      title: "难度",
      dataIndex: "difficulty",
      width: 112,
      render: (value: string) => {
        const meta = difficultyMeta[value] ?? { label: value, className: "" };
        return <span className={`difficulty-badge ${meta.className}`}>{meta.label}</span>;
      }
    },
    {
      title: "标签",
      dataIndex: "tags",
      responsive: ["md"],
      render: (items: Problem["tags"]) => (
        <Space size={[0, 6]} wrap>
          {items.slice(0, 4).map((tag) => (
            <Tag key={tag.id} className="tag-chip">
              {tag.name}
            </Tag>
          ))}
          {items.length > 4 && <Tag className="tag-chip">+{items.length - 4}</Tag>}
        </Space>
      )
    },
    {
      title: "通过率",
      dataIndex: "pass_rate",
      width: 160,
      render: (value: number, row) => (
        <div className="pass-rate-cell">
          <Progress percent={Number(value.toFixed(2))} size="small" showInfo={false} />
          <span>{value.toFixed(2)}%</span>
          <Typography.Text type="secondary">
            {row.accept_count}/{row.submit_count}
          </Typography.Text>
        </div>
      )
    },
    {
      title: "",
      width: 96,
      render: (_, row) => (
        <Button type="link" className="table-action-link" onClick={() => navigate(`/problems/${row.id}`)}>
          进入
        </Button>
      )
    }
  ];

  return (
    <main className="page-stack">
      <section className="page-hero compact">
        <div>
          <Typography.Text className="eyebrow">Problem Set</Typography.Text>
          <Typography.Title level={1}>题库练习</Typography.Title>
          <Typography.Paragraph>
            按状态、难度和标签定位题目，持续追踪自己的通过情况。
          </Typography.Paragraph>
        </div>
        <div className="hero-metrics">
          <div>
            <span>{data.total}</span>
            <label>题目总数</label>
          </div>
          <div>
            <span>{pageStats.accepted}</span>
            <label>本页已过</label>
          </div>
          <div>
            <span>{pageStats.attempted}</span>
            <label>本页尝试</label>
          </div>
        </div>
      </section>

      <section className="problem-workbench">
        <aside className="problem-filter-panel">
          <div className="filter-panel-title">
            <FilterOutlined />
            <span>筛选</span>
          </div>
          <Input
            allowClear
            prefix={<SearchOutlined />}
            placeholder="搜索题目、slug"
            value={filters.keyword}
            onChange={(event) => setFilters((current) => ({ ...current, keyword: event.target.value }))}
            onPressEnter={() => load(1)}
          />
          <Select
            allowClear
            placeholder="难度"
            value={filters.difficulty}
            onChange={(value) => applyFilter({ difficulty: value })}
            options={[
              { label: "入门 Easy", value: "Easy" },
              { label: "进阶 Medium", value: "Medium" },
              { label: "挑战 Hard", value: "Hard" }
            ]}
          />
          <Select
            allowClear
            disabled={!user}
            placeholder={user ? "我的状态" : "登录后筛选状态"}
            value={filters.status}
            onChange={(value) => applyFilter({ status: value })}
            options={[
              { label: "未开始", value: "todo" },
              { label: "已尝试", value: "attempted" },
              { label: "已通过", value: "accepted" }
            ]}
          />
          <Select
            allowClear
            showSearch
            suffixIcon={<TagsOutlined />}
            placeholder="标签"
            value={filters.tag}
            onChange={(value) => applyFilter({ tag: value })}
            optionFilterProp="label"
            options={tags.map((tag) => ({
              label: `${tag.name} (${tag.problem_count})`,
              value: tag.name
            }))}
          />
          <Space className="filter-actions">
            <Button type="primary" icon={<SearchOutlined />} onClick={() => load(1)}>
              查询
            </Button>
            <Button onClick={resetFilters}>重置</Button>
          </Space>
        </aside>

        <section className="problem-table-panel">
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={data.items}
            rowClassName={(row) => (row.accepted ? "problem-row-accepted" : row.attempted ? "problem-row-attempted" : "")}
            pagination={{
              current: data.page,
              total: data.total,
              pageSize: data.page_size,
              showSizeChanger: false,
              showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
              onChange: (page) => load(page)
            }}
          />
        </section>
      </section>
    </main>
  );
}
