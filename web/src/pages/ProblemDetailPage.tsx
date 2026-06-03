import Editor from "@monaco-editor/react";
import { PlayCircleOutlined } from "@ant-design/icons";
import { Alert, Button, Divider, message, Select, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Problem, request, Submission } from "../api/client";
import { useAuth } from "../state/AuthContext";

const monacoLanguage: Record<string, string> = {
  go: "go",
  c: "c",
  cpp: "cpp",
  python: "python"
};

const difficultyColor: Record<string, string> = {
  Easy: "green",
  Medium: "gold",
  Hard: "red"
};

export default function ProblemDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [problem, setProblem] = useState<Problem>();
  const [language, setLanguage] = useState("cpp");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setCode("");
    async function load() {
      const data = await request<{ problem: Problem }>(`/problems/${id}`);
      setProblem(data.problem);
    }
    void load();
  }, [id]);

  const sample = useMemo(() => problem?.samples?.[0], [problem]);

  async function submit() {
    if (!user) {
      navigate("/login");
      return;
    }
    setSubmitting(true);
    try {
      const data = await request<{ submission: Submission }>(`/problems/${id}/submit`, {
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

  if (!problem) {
    return <main className="page-stack">加载中...</main>;
  }

  return (
    <main className="problem-detail-grid">
      <section className="surface statement-pane">
        <Space direction="vertical" size={16} className="full-width">
          <div className="statement-title-block">
            <Typography.Text className="eyebrow">Problem #{problem.id}</Typography.Text>
            <Typography.Title level={1}>{problem.title}</Typography.Title>
            <Space size={[8, 8]} wrap>
              <Tag color={difficultyColor[problem.difficulty] ?? "default"}>{problem.difficulty}</Tag>
              <Tag>{problem.time_limit_ms} ms</Tag>
              <Tag>{problem.memory_limit_mb} MB</Tag>
              {problem.tags.map((tag) => (
                <Tag key={tag.id} className="tag-chip">
                  {tag.name}
                </Tag>
              ))}
            </Space>
          </div>

          <Typography.Paragraph className="pre-line statement-copy">{problem.description}</Typography.Paragraph>
          <Divider />

          <section className="statement-section">
            <Typography.Title level={4}>输入格式</Typography.Title>
            <Typography.Paragraph className="pre-line">{problem.input_description}</Typography.Paragraph>
          </section>

          <section className="statement-section">
            <Typography.Title level={4}>输出格式</Typography.Title>
            <Typography.Paragraph className="pre-line">{problem.output_description}</Typography.Paragraph>
          </section>

          {sample && (
            <section className="statement-section">
              <Typography.Title level={4}>样例</Typography.Title>
              <div className="sample-grid">
                <div>
                  <div className="sample-label">输入</div>
                  <pre>{sample.input}</pre>
                </div>
                <div>
                  <div className="sample-label">输出</div>
                  <pre>{sample.expected_output}</pre>
                </div>
              </div>
            </section>
          )}
          {problem.hint && <Alert type="info" message={problem.hint} />}
        </Space>
      </section>

      <section className="surface submit-pane">
        <div className="submit-header">
          <div>
            <Typography.Text strong>提交代码</Typography.Text>
            <Typography.Text type="secondary" className="submit-subtitle">
              标准输入输出，代码不会预置模板
            </Typography.Text>
          </div>
          <Space>
            <Select
              value={language}
              onChange={setLanguage}
              style={{ width: 112 }}
              options={[
                { label: "Go", value: "go" },
                { label: "C", value: "c" },
                { label: "C++", value: "cpp" },
                { label: "Python", value: "python" }
              ]}
            />
            <Button type="primary" icon={<PlayCircleOutlined />} loading={submitting} onClick={submit}>
              提交
            </Button>
          </Space>
        </div>
        <Editor
          height="calc(100vh - 232px)"
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
