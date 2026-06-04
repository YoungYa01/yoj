import Editor from "@monaco-editor/react";
import {Alert, Button, Descriptions, Table, Tag, Typography} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useState } from "react";
import {Link, useNavigate, useParams} from "react-router-dom";
import { request, Submission, SubmissionResult } from "../api/client";
import { statusColor } from "../utils/status";
import {ArrowLeftOutlined} from "@ant-design/icons";

const monacoLanguage: Record<string, string> = {
  go: "go",
  c: "c",
  cpp: "cpp",
  python: "python"
};

export default function SubmissionDetailPage() {
  const { id } = useParams();
  const [submission, setSubmission] = useState<Submission>();
  const navigate = useNavigate();

  async function load() {
    const data = await request<{ submission: Submission }>(`/submissions/${id}`);
    setSubmission(data.submission);
  }

  useEffect(() => {
    void load();
  }, [id]);

  useEffect(() => {
    if (!submission || !["Pending", "Judging"].includes(submission.status)) {
      return;
    }
    const timer = window.setInterval(() => void load(), 1500);
    return () => window.clearInterval(timer);
  }, [submission?.status, id]);

  if (!submission) {
    return <main className="page-stack">加载中...</main>;
  }

  const columns: ColumnsType<SubmissionResult> = [
    {
      title: "#",
      dataIndex: "sort_order",
      width: 80
    },
    {
      title: "状态",
      dataIndex: "status",
      render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>
    },
    {
      title: "耗时",
      dataIndex: "time_used_ms",
      width: 100,
      render: (value: number) => `${value} ms`
    },
    {
      title: "样例",
      dataIndex: "is_sample",
      width: 90,
      render: (value: boolean) => (value ? "是" : "否")
    }
  ];

  return (
    <main className="page-stack">
      <Typography.Title level={2} className={"main-nav"}>
          <Button icon={<ArrowLeftOutlined/>} variant={"text"} color={"default"} size={"large"} onClick={() => navigate(-1)}></Button>
          提交 #{submission.id}
      </Typography.Title>
      <section className="surface">
        <Descriptions bordered column={{ xs: 1, md: 2 }}>
          <Descriptions.Item label="题目">
            <Link to={`/problems/${submission.problem.id}`}>{submission.problem.title}</Link>
          </Descriptions.Item>
          {submission.contest && (
            <Descriptions.Item label="比赛">
              <Link to={`/contests/${submission.contest.id}`}>{submission.contest.title}</Link>
            </Descriptions.Item>
          )}
          <Descriptions.Item label="用户">{submission.user.username}</Descriptions.Item>
          <Descriptions.Item label="语言">{submission.language}</Descriptions.Item>
          <Descriptions.Item label="状态">
            <Tag color={statusColor(submission.status)}>{submission.status}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="耗时">{submission.time_used_ms} ms</Descriptions.Item>
          <Descriptions.Item label="提交时间">{submission.created_at}</Descriptions.Item>
        </Descriptions>
        {submission.error_message && <Alert className="mt-16" type="error" message={submission.error_message} />}
      </section>
      <section className="surface">
        <Typography.Title level={4}>测试点</Typography.Title>
        <Table rowKey="id" columns={columns} dataSource={submission.results ?? []} pagination={false} />
      </section>
      <section className="surface">
        <Typography.Title level={4}>代码</Typography.Title>
        {submission.can_view_code ? (
          <Editor
            height="420px"
            language={monacoLanguage[submission.language] ?? "plaintext"}
            theme="vs-dark"
            value={submission.code ?? ""}
            options={{ readOnly: true, minimap: { enabled: false }, fontSize: 14, scrollBeyondLastLine: false }}
          />
        ) : (
          <Alert type="info" message="代码仅提交者本人可见" />
        )}
      </section>
    </main>
  );
}
