import { Button, Col, Row, Statistic, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { DashboardStats, request, Submission } from "../../api/client";
import AdminNav from "../../components/AdminNav";
import { statusColor } from "../../utils/status";

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<DashboardStats>();
  const [recentSubmissions, setRecentSubmissions] = useState<Submission[]>([]);

  async function load() {
    setLoading(true);
    try {
      const data = await request<{ stats: DashboardStats; recent_submissions: Submission[] }>("/admin/dashboard");
      setStats(data.stats);
      setRecentSubmissions(data.recent_submissions);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
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
      dataIndex: ["user", "username"],
      width: 130
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
      title: "提交时间",
      dataIndex: "created_at",
      width: 180
    }
  ];

  return (
    <main className="page-stack">
      <AdminNav />
      <div className="page-title-row">
        <div>
          <Typography.Title level={2}>后台概览</Typography.Title>
          <Typography.Text type="secondary">最近刷新：{stats?.generated_at ?? "-"}</Typography.Text>
        </div>
        <Button onClick={load}>刷新</Button>
      </div>
      <Row gutter={[16, 16]}>
        <Col xs={12} md={6}>
          <section className="surface stat-surface">
            <Statistic title="用户" value={stats?.user_count ?? 0} />
          </section>
        </Col>
        <Col xs={12} md={6}>
          <section className="surface stat-surface">
            <Statistic title="题目" value={stats?.problem_count ?? 0} suffix={`/ ${stats?.published_problem_count ?? 0} 发布`} />
          </section>
        </Col>
        <Col xs={12} md={6}>
          <section className="surface stat-surface">
            <Statistic title="提交" value={stats?.submission_count ?? 0} />
          </section>
        </Col>
        <Col xs={12} md={6}>
          <section className="surface stat-surface">
            <Statistic title="通过率" value={stats?.pass_rate ?? 0} precision={2} suffix="%" />
          </section>
        </Col>
        <Col xs={12} md={6}>
          <section className="surface stat-surface">
            <Statistic title="队列任务" value={stats?.judge_queue_length ?? 0} />
          </section>
        </Col>
        <Col xs={12} md={6}>
          <section className="surface stat-surface">
            <Statistic title="Pending" value={stats?.pending_submission_count ?? 0} />
          </section>
        </Col>
        <Col xs={12} md={6}>
          <section className="surface stat-surface">
            <Statistic title="Judging" value={stats?.judging_submission_count ?? 0} />
          </section>
        </Col>
        <Col xs={12} md={6}>
          <section className="surface stat-surface">
            <Statistic title="Accepted" value={stats?.accepted_submission_count ?? 0} />
          </section>
        </Col>
      </Row>
      <section className="surface">
        <div className="section-title-row">
          <Typography.Title level={4}>最近提交</Typography.Title>
          <Button onClick={() => navigate("/admin/submissions")}>查看全部</Button>
        </div>
        <Table rowKey="id" loading={loading} columns={columns} dataSource={recentSubmissions} pagination={false} />
      </section>
    </main>
  );
}
