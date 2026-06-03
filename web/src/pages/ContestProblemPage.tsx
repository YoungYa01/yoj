import Editor from "@monaco-editor/react";
import { ArrowLeftOutlined, PlayCircleOutlined } from "@ant-design/icons";
import { Alert, Button, Divider, message, Select, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Contest, Problem, request, Submission } from "../api/client";

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
                const data = await request<{ contest: Contest; problem: Problem }>(
                    `/contests/${id}/problems/${problemId}`
                );

                setContest(data.contest);
                setProblem(data.problem);
            } catch (error) {
                setAccessError((error as Error).message);

                const contestData = await request<{ contest: Contest }>(`/contests/${id}`).catch(
                    () => undefined
                );

                if (contestData) {
                    setContest(contestData.contest);
                }
            }
        }

        void load();
    }, [id, problemId]);

    const samples = useMemo(() => problem?.samples ?? [], [problem]);

    async function submit() {
        setSubmitting(true);

        try {
            const data = await request<{ submission: Submission }>(
                `/contests/${id}/problems/${problemId}/submit`,
                {
                    method: "POST",
                    body: JSON.stringify({ language, code })
                }
            );

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
                    <Button icon={<ArrowLeftOutlined />} onClick={() => navigate(`/contests/${id}`)}>
                        返回比赛
                    </Button>

                    <div>
                        <Typography.Text type="secondary">{contest.title}</Typography.Text>
                        <Typography.Title level={2}>{problem.title}</Typography.Title>

                        <Space wrap>
                            <Tag color={difficultyColor[problem.difficulty]}>{problem.difficulty}</Tag>
                            {problem.tags?.map((tag) => (
                                <Tag key={tag.id}>{tag.name}</Tag>
                            ))}
                        </Space>
                    </div>

                    <Divider />

                    <Typography.Title level={4}>题目描述</Typography.Title>
                    <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
                        {problem.description}
                    </Typography.Paragraph>

                    <Typography.Title level={4}>输入说明</Typography.Title>
                    <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
                        {problem.input_description}
                    </Typography.Paragraph>

                    <Typography.Title level={4}>输出说明</Typography.Title>
                    <Typography.Paragraph style={{ whiteSpace: "pre-wrap" }}>
                        {problem.output_description}
                    </Typography.Paragraph>

                    {samples.length > 0 && (
                        <>
                            <Typography.Title level={4}>样例</Typography.Title>

                            <Space direction="vertical" size={16} className="full-width">
                                {samples.map((sample, index) => (
                                    <div key={sample.id ?? index}>
                                        <Typography.Text strong>样例 {index + 1}</Typography.Text>

                                        <div className="sample-grid">
                                            <div>
                                                <Typography.Text type="secondary">输入</Typography.Text>
                                                <pre>{sample.input}</pre>
                                            </div>

                                            <div>
                                                <Typography.Text type="secondary">输出</Typography.Text>
                                                <pre>{sample.expected_output}</pre>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </Space>
                        </>
                    )}

                    {problem.hint && (
                        <>
                            <Typography.Title level={4}>提示</Typography.Title>
                            <Alert type="info" message={problem.hint} />
                        </>
                    )}
                </Space>
            </section>

            <section className="surface submit-pane">
                <Space direction="vertical" size={16} className="full-width">
                    <div className="submit-toolbar">
                        <Select
                            value={language}
                            onChange={setLanguage}
                            options={[
                                { label: "Go", value: "go" },
                                { label: "C++", value: "cpp" },
                                { label: "C", value: "c" },
                                { label: "Python", value: "python" }
                            ]}
                        />

                        <Button
                            type="primary"
                            icon={<PlayCircleOutlined />}
                            loading={submitting}
                            onClick={submit}
                        >
                            提交
                        </Button>
                    </div>

                    <Editor
                        height="70vh"
                        language={monacoLanguage[language]}
                        value={code}
                        onChange={(value) => setCode(value ?? "")}
                        options={{
                            minimap: { enabled: false },
                            fontSize: 14,
                            tabSize: 2
                        }}
                    />
                </Space>
            </section>
        </main>
    );
}