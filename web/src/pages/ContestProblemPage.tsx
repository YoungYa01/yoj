import Editor from "@monaco-editor/react";
import { PlayCircleOutlined } from "@ant-design/icons";
import { Alert, Button, Divider, message, Select, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Contest, Problem, request, Submission } from "../api/client";

const monacoLanguage: Record<string, string> = {
  go: "go",
  c: "c",
  cpp: "cpp",
  python: "python"
};

export default function ContestProblemPage() {
  const { id, problemId } = useParams();
  const navigate = useNavigate();
  const [contest, setContest] = useState<Contest>();
  const [problem, setProblem] = useState<Problem>();
  const [accessError, setAccessError] = useState("");
  const [language, setLanguage] = useState("go");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCode("");
    setAccessError("");
    async function load() {
      try {
        const data = await request<{ contest: Contest; problem: Problem }>(`/contests/${id}/problems/${problemId}`);
        setContest(data.contest);
        setProblem(data.problem);
      } catch (error) {
        setAccessError((error as Error).message);
        const contestData = await request<{ contest: Contest }>(`/contests/${id}`).catch(() => undefined);
        if (contestData) {
          setContest(contestData.contest);
        }
      }
    }
    void load();
  }, [id, problemId]);

  const sample = useMemo(() => problem?.samples?.[0], [problem]);

  async function submit() {
    setSubmitting(true);
    try {
      const data = await request<{ submission: Submission }>(`/contests/${id}/problems/${problemId}/submit`, {
        method: "POST",
        body: JSON.stringify({ language, code })
      });
      message.success("提交成功，正在判题");
      navigate(`/submissions/${data.submission.id}`);
    } catch (error) {
      message.error((error as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (accessError) {
    return (
      <main className="page-stack">
        <section className="surface">
          <Alert type="warning" message="暂不能进入比赛题目" description={accessError} />
          <Button className="mt-16" onClick={() => navigate(`/contests/${id}`)}>
            返回比赛
          </Button>
        </section>
      </main>
    );
  }

  if (!contest || !problem) {
    return <main className="page-stack">加载中...</main>;
  }

  return (
    <main className="problem-detail-grid">
      <section className="surface statement-pane">
        <Space direction="vertical" size={12} className="full-width">
          <div>
            <Typography.Text type="secondary">
              <Link to={`/contests/${contest.id}`}>{contest.title}</Link>
            </Typography.Text>
            <Typography.Title level={2}>{problem.title}</Typography.Title>
            <Space wrap>
              <Tag color={problem.difficulty === "Easy" ? "green" : problem.difficulty === "Hard" ? "red" : "gold"}>
                {problem.difficulty}
              </Tag>
              <Tag>{problem.time_limit_ms} ms</Tag>
              <Tag>{problem.memory_limit_mb} MB</Tag>
            </Space>
          </div>
          <Typography.Paragraph className="pre-line">{problem.description}</Typography.Paragraph>
          <Divider />
          <Typography.Title level={4}>输入格式</Typography.Title>
          <Typography.Paragraph className="pre-line">{problem.input_description}</Typography.Paragraph>
          <Typography.Title level={4}>输出格式</Typography.Title>
          <Typography.Paragraph className="pre-line">{problem.output_description}</Typography.Paragraph>
          {sample && (
            <>
              <Typography.Title level={4}>样例</Typography.Title>
              <div className="sample-grid">
                <pre>{sample.input}</pre>
                <pre>{sample.expected_output}</pre>
              </div>
            </>
          )}
          {problem.hint && <Alert type="info" message={problem.hint} />}
        </Space>
      </section>
      <section className="surface submit-pane">
        <div className="submit-header">
          <Select
            value={language}
            onChange={setLanguage}
            options={[
              { label: "Go", value: "go" },
              { label: "C", value: "c" },
              { label: "C++", value: "cpp" },
              { label: "Python", value: "python" }
            ]}
          />
          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={submitting}
            disabled={contest.status !== "running"}
            onClick={submit}
          >
            提交
          </Button>
        </div>
        {contest.status !== "running" && <Alert type="warning" message="比赛未处于进行中，暂不能提交" />}
        <Editor
          height="calc(100vh - 210px)"
          language={monacoLanguage[language]}
          theme="vs-dark"
          value={code}
          onChange={(value) => setCode(value ?? "")}
          options={{ minimap: { enabled: false }, fontSize: 14, tabSize: 4, scrollBeyondLastLine: false }}
        />
      </section>
    </main>
  );
}
