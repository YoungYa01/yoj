import { Alert, Button, Descriptions, message, Space, Table, Tabs, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Contest, ContestProblem, ContestStandingRow, request } from "../api/client";
import { statusColor } from "../utils/status";
import { useAuth } from "../state/AuthContext";

const statusMeta: Record<string, { label: string; color: string }> = {
  upcoming: { label: "未开始", color: "blue" },
  running: { label: "进行中", color: "green" },
  ended: { label: "已结束", color: "default" }
};

function formatPenalty(seconds: number) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${m}m ${s}s`;
}

export default function ContestDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [contest, setContest] = useState<Contest>();
  const [standings, setStandings] = useState<ContestStandingRow[]>([]);
  const [loadingStanding, setLoadingStanding] = useState(false);

  async function loadContest() {
    const data = await request<{ contest: Contest }>(`/contests/${id}`);
    setContest(data.contest);
  }

  async function loadStandings() {
    setLoadingStanding(true);
    try {
      const data = await request<{ standings: ContestStandingRow[] }>(`/contests/${id}/standings`);
      setStandings(data.standings);
    } finally {
      setLoadingStanding(false);
    }
  }

  async function join() {
    if (!user) {
      navigate("/login");
      return;
    }
    try {
      await request(`/contests/${id}/join`, { method: "POST" });
      message.success("报名成功");
      await loadContest();
      await loadStandings();
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  useEffect(() => {
    void loadContest();
    void loadStandings();
  }, [id]);

  const problemColumns: ColumnsType<ContestProblem> = [
    {
      title: "#",
      dataIndex: "sort_order",
      width: 80
    },
    {
      title: "题目",
      render: (_, row) =>
        contest?.joined || user?.role === "admin" ? (
          <Link to={`/contests/${id}/problems/${row.problem_id}`}>{row.problem.title}</Link>
        ) : (
          row.problem.title
        )
    },
    {
      title: "分值",
      dataIndex: "score",
      width: 90
    },
    {
      title: "操作",
      width: 120,
      render: (_, row) => (
        <Button
          type="primary"
          disabled={!contest?.joined && user?.role !== "admin"}
          onClick={() => navigate(`/contests/${id}/problems/${row.problem_id}`)}
        >
          提交
        </Button>
      )
    }
  ];

  const problemOrder = useMemo(() => contest?.problems ?? [], [contest]);
  const standingColumns: ColumnsType<ContestStandingRow> = [
    {
      title: "排名",
      dataIndex: "rank",
      width: 80
    },
    {
      title: "用户",
      dataIndex: ["user", "username"]
    },
    {
      title: "通过",
      dataIndex: "solved",
      width: 90
    },
    {
      title: "罚时",
      dataIndex: "total_penalty_seconds",
      width: 130,
      render: (value: number) => formatPenalty(value)
    },
    ...problemOrder.map((problem) => ({
      title: `P${problem.sort_order}`,
      width: 110,
      render: (_: unknown, row: ContestStandingRow) => {
        const cell = row.problems.find((item) => item.problem_id === problem.problem_id);
        if (!cell || cell.attempts === 0) {
          return "-";
        }
        return cell.accepted ? (
          <Tag color="green">{cell.attempts} / {formatPenalty(cell.penalty_seconds)}</Tag>
        ) : (
          <Tag color={statusColor(cell.last_submission_status ?? "")}>{cell.attempts}</Tag>
        );
      }
    }))
  ];

  if (!contest) {
    return <main className="page-stack">加载中...</main>;
  }

  return (
    <main className="page-stack">
      <div className="page-title-row">
        <div>
          <Typography.Title level={2}>{contest.title}</Typography.Title>
          <Space wrap>
            <Tag color={statusMeta[contest.status]?.color}>{statusMeta[contest.status]?.label ?? contest.status}</Tag>
            {contest.joined ? <Tag color="green">已报名</Tag> : <Tag>未报名</Tag>}
          </Space>
        </div>
        <Space>
          <Button onClick={() => loadStandings()}>刷新榜单</Button>
          <Button type="primary" disabled={contest.joined || contest.status === "ended"} onClick={join}>
            报名
          </Button>
        </Space>
      </div>
      <section className="surface">
        <Descriptions bordered column={{ xs: 1, md: 2 }}>
          <Descriptions.Item label="开始时间">{contest.start_time}</Descriptions.Item>
          <Descriptions.Item label="结束时间">{contest.end_time}</Descriptions.Item>
          <Descriptions.Item label="题目数">{contest.problem_count}</Descriptions.Item>
          <Descriptions.Item label="报名人数">{contest.participant_count}</Descriptions.Item>
        </Descriptions>
        {contest.description && <Typography.Paragraph className="pre-line mt-16">{contest.description}</Typography.Paragraph>}
      </section>
      <section className="surface">
        <Tabs
          items={[
            {
              key: "problems",
              label: "题目",
              children: (
                <Space direction="vertical" className="full-width">
                  {!contest.joined && user?.role !== "admin" && (
                    <Alert type="info" message="报名后才能进入比赛题目并提交代码" />
                  )}
                  <Table rowKey="id" columns={problemColumns} dataSource={contest.problems ?? []} pagination={false} />
                </Space>
              )
            },
            {
              key: "standings",
              label: "榜单",
              children: <Table rowKey={(row) => row.user.id} loading={loadingStanding} columns={standingColumns} dataSource={standings} pagination={false} scroll={{ x: true }} />
            }
          ]}
        />
      </section>
    </main>
  );
}
