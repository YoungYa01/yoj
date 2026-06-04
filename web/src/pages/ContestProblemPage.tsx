import Editor from "@monaco-editor/react";
import {
    ArrowLeftOutlined,
    ClockCircleOutlined,
    CodeOutlined,
    CopyOutlined,
    MenuOutlined,
    PlayCircleOutlined,
    ReloadOutlined,
    SearchOutlined
} from "@ant-design/icons";
import {
    Alert,
    Button,
    Drawer,
    Empty,
    Input,
    List,
    message,
    Select,
    Space,
    Spin,
    Tabs,
    Tag,
    Tooltip,
    Typography
} from "antd";
import type {CSSProperties, PointerEvent as ReactPointerEvent, UIEvent as ReactUIEvent} from "react";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {Contest, ContestProblem, Problem, request, Submission} from "../api/client";
import {useAuth} from "../state/AuthContext";
import {useThemeSettings} from "../state/ThemeContext";
import ProblemSubmissionsPanel from "../components/ProblemSubmissionsPanel";
import SelfTestPanel from "../components/SelfTestPanel";

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

const contestStatusMeta: Record<string, { label: string; color: string }> = {
    upcoming: {label: "未开始", color: "blue"},
    running: {label: "进行中", color: "green"},
    ended: {label: "已结束", color: "default"}
};

const languageOptions = [
    {label: "C++", value: "cpp"},
    {label: "C", value: "c"},
    {label: "Go", value: "go"},
    {label: "Python", value: "python"}
];

function formatRate(value?: number) {
    return `${Number(value ?? 0).toFixed(2)}%`;
}

function getContestProblemTitle(item: ContestProblem) {
    return `P${item.sort_order} ${item.problem.title}`;
}

export default function ContestProblemPage() {
    const {id, problemId} = useParams();
    const navigate = useNavigate();
    const {user} = useAuth();
    const {monacoTheme} = useThemeSettings();

    const splitRef = useRef<HTMLDivElement | null>(null);

    const [contest, setContest] = useState<Contest>();
    const [problem, setProblem] = useState<Problem>();
    const [accessError, setAccessError] = useState("");
    const [problemLoading, setProblemLoading] = useState(false);

    const [language, setLanguage] = useState("cpp");
    const [code, setCode] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState("statement");

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [problemKeyword, setProblemKeyword] = useState("");
    const [selfTestOpen, setSelfTestOpen] = useState(false);

    const [leftWidth, setLeftWidth] = useState(() => {
        const cached = Number(localStorage.getItem("yoj_contest_problem_split_width"));
        return Number.isFinite(cached) && cached >= 34 && cached <= 68 ? cached : 50;
    });

    const samples = useMemo(() => problem?.samples ?? [], [problem]);

    const contestProblems = useMemo(() => {
        return [...(contest?.problems ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    }, [contest]);

    const filteredContestProblems = useMemo(() => {
        const keyword = problemKeyword.trim().toLowerCase();

        if (!keyword) {
            return contestProblems;
        }

        return contestProblems.filter((item) => {
            return (
                item.problem.title.toLowerCase().includes(keyword) ||
                item.problem.slug.toLowerCase().includes(keyword) ||
                `p${item.sort_order}`.includes(keyword)
            );
        });
    }, [contestProblems, problemKeyword]);

    const currentContestProblem = useMemo(() => {
        return contestProblems.find((item) => String(item.problem_id) === String(problemId));
    }, [contestProblems, problemId]);

    const draftKey = useMemo(() => {
        if (!id || !problemId) {
            return "";
        }

        return `yoj_contest_${id}_problem_${problemId}_${language}_code`;
    }, [id, problemId, language]);

    const pageStyle = {
        "--solve-left-width": `${leftWidth}%`
    } as CSSProperties;

    const load = useCallback(async () => {
        if (!id || !problemId) {
            return;
        }

        setProblemLoading(true);
        setAccessError("");

        try {
            const [problemData, contestData] = await Promise.all([
                request<{ contest: Contest; problem: Problem }>(
                    `/contests/${id}/problems/${problemId}`
                ),
                request<{ contest: Contest }>(`/contests/${id}`)
            ]);

            setProblem(problemData.problem);
            setContest(contestData.contest ?? problemData.contest);
        } catch (error) {
            setAccessError((error as Error).message);

            const contestData = await request<{ contest: Contest }>(`/contests/${id}`).catch(
                () => undefined
            );

            if (contestData) {
                setContest(contestData.contest);
            }
        } finally {
            setProblemLoading(false);
        }
    }, [id, problemId]);

    useEffect(() => {
        document.body.classList.add("problem-solve-mode");

        return () => {
            document.body.classList.remove("problem-solve-mode");
        };
    }, []);

    useEffect(() => {
        localStorage.setItem("yoj_contest_problem_split_width", String(leftWidth));
    }, [leftWidth]);

    useEffect(() => {
        void load();
    }, [load]);

    useEffect(() => {
        if (!draftKey) {
            return;
        }

        setCode(localStorage.getItem(draftKey) ?? "");
    }, [draftKey]);

    useEffect(() => {
        if (!draftKey) {
            return;
        }

        const timer = window.setTimeout(() => {
            localStorage.setItem(draftKey, code);
        }, 250);

        return () => {
            window.clearTimeout(timer);
        };
    }, [draftKey, code]);

    function startResize(event: ReactPointerEvent<HTMLDivElement>) {
        event.preventDefault();

        const container = splitRef.current;
        if (!container) {
            return;
        }

        const rect = container.getBoundingClientRect();

        function handleMove(moveEvent: PointerEvent) {
            const raw = ((moveEvent.clientX - rect.left) / rect.width) * 100;
            const next = Math.min(68, Math.max(34, raw));
            setLeftWidth(next);
        }

        function handleUp() {
            window.removeEventListener("pointermove", handleMove);
            window.removeEventListener("pointerup", handleUp);
            document.body.classList.remove("problem-resizing");
        }

        document.body.classList.add("problem-resizing");
        window.addEventListener("pointermove", handleMove);
        window.addEventListener("pointerup", handleUp);
    }

    async function submit() {
        if (!user) {
            navigate("/login");
            return;
        }

        if (!code.trim()) {
            message.warning("先写点代码再提交吧");
            return;
        }

        setSubmitting(true);

        try {
            const data = await request<{ submission: Submission }>(
                `/contests/${id}/problems/${problemId}/submit`,
                {
                    method: "POST",
                    body: JSON.stringify({language, code})
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

    function resetCode() {
        setCode("");

        if (draftKey) {
            localStorage.removeItem(draftKey);
        }

        message.success("代码已清空");
    }

    async function copyText(text: string) {
        try {
            await navigator.clipboard.writeText(text);
            message.success("已复制");
        } catch {
            message.warning("复制失败，请手动复制");
        }
    }

    function switchContestProblem(item: ContestProblem) {
        if (String(item.problem_id) === String(problemId)) {
            setDrawerOpen(false);
            return;
        }

        setDrawerOpen(false);
        setActiveTab("statement");
        navigate(`/contests/${id}/problems/${item.problem_id}`);
    }

    function handleProblemListScroll(_event: ReactUIEvent<HTMLDivElement>) {
        // 比赛题目数量通常不大，当前列表来自 contest.problems，本地过滤即可。
        // 保留这个函数是为了和普通题目详情页的 Drawer 结构一致。
    }

    if (problemLoading && !problem && !accessError) {
        return (
            <main className="solve-loading">
                <Spin/>
                <Typography.Text type="secondary">正在加载比赛题目...</Typography.Text>
            </main>
        );
    }

    if (accessError) {
        return (
            <main className="solve-loading">
                <Alert
                    type="warning"
                    showIcon
                    message="暂不能进入比赛题目"
                    description={accessError}
                />

                <Space>
                    <Button icon={<ArrowLeftOutlined/>} onClick={() => navigate(`/contests/${id}`)}>
                        返回比赛
                    </Button>

                    {contest?.joined === false && (
                        <Button type="primary" onClick={() => navigate(`/contests/${id}`)}>
                            去报名
                        </Button>
                    )}
                </Space>
            </main>
        );
    }

    if (!contest || !problem) {
        return (
            <main className="solve-loading">
                <Empty description="比赛题目不存在或暂不可访问"/>
                <Button onClick={() => navigate(`/contests/${id}`)}>返回比赛</Button>
            </main>
        );
    }

    const contestStatus = contestStatusMeta[contest.status] ?? {
        label: contest.status,
        color: "default"
    };

    return (
        <main className="problem-solve-page" style={pageStyle}>
            <div className="solve-split" ref={splitRef}>
                <section className="solve-left-panel">
                    <header className="solve-problem-tabs">
                        <Space size={8}>
                            <Tooltip title="比赛题目列表">
                                <Button icon={<MenuOutlined/>} variant={"text"} color={"default"}
                                        onClick={() => setDrawerOpen(true)}/>
                            </Tooltip>

                            <Tooltip title="返回比赛">
                                <Button
                                    icon={<ArrowLeftOutlined/>}
                                    variant={"text"} color={"default"}
                                    onClick={() => navigate(`/contests/${id}`)}
                                />
                            </Tooltip>
                        </Space>
                        <Tabs
                            activeKey={activeTab}
                            onChange={setActiveTab}
                            items={[
                                {key: "statement", label: "题目描述"},
                                {key: "submissions", label: "我的提交"}
                            ]}
                        />

                    </header>

                    {activeTab === "statement" ? (
                        <div className="solve-statement-scroll">
                            <section className="solve-title-block">
                                <div className="solve-title-row">
                                    <div>
                                        <Typography.Text className="solve-problem-id">
                                            {contest.title}
                                            {currentContestProblem
                                                ? ` · P${currentContestProblem.sort_order}`
                                                : ""}
                                        </Typography.Text>

                                        <Typography.Title level={1}>{problem.title}</Typography.Title>
                                    </div>

                                    <span className="solve-mini-status">
                    {currentContestProblem ? `${currentContestProblem.score} 分` : "比赛"}
                  </span>
                                </div>

                                <Space size={[8, 8]} wrap>
                                    <Tag color={contestStatus.color}>{contestStatus.label}</Tag>

                                    <Tag color={difficultyColor[problem.difficulty] ?? "default"}>
                                        {problem.difficulty}
                                    </Tag>

                                    <Tag>{problem.time_limit_ms} ms</Tag>
                                    <Tag>{problem.memory_limit_mb} MB</Tag>

                                    {problem.tags?.map((tag) => (
                                        <Tag key={tag.id} className="solve-tag">
                                            {tag.name}
                                        </Tag>
                                    ))}
                                </Space>
                            </section>

                            <section className="solve-meta-box">
                                <div>
                                    <span>比赛</span>
                                    <strong>{contest.title}</strong>
                                </div>

                                <div>
                                    <span>题号</span>
                                    <strong>
                                        {currentContestProblem
                                            ? `P${currentContestProblem.sort_order}`
                                            : `#${problem.id}`}
                                    </strong>
                                </div>

                                <div>
                                    <span>分值</span>
                                    <strong>{currentContestProblem?.score ?? "-"} 分</strong>
                                </div>

                                <div>
                                    <span>通过率</span>
                                    <strong>{formatRate(problem.pass_rate)}</strong>
                                </div>
                            </section>

                            <section className="solve-section">
                                <Typography.Title level={4}>描述</Typography.Title>
                                <Typography.Paragraph className="solve-pre-line">
                                    {problem.description}
                                </Typography.Paragraph>
                            </section>

                            <section className="solve-section">
                                <Typography.Title level={4}>输入描述</Typography.Title>
                                <Typography.Paragraph className="solve-pre-line">
                                    {problem.input_description}
                                </Typography.Paragraph>
                            </section>

                            <section className="solve-section">
                                <Typography.Title level={4}>输出描述</Typography.Title>
                                <Typography.Paragraph className="solve-pre-line">
                                    {problem.output_description}
                                </Typography.Paragraph>
                            </section>

                            {samples.length > 0 && (
                                <section className="solve-section">
                                    <Typography.Title level={4}>样例</Typography.Title>

                                    <Space direction="vertical" size={16} className="full-width">
                                        {samples.map((sample, index) => (
                                            <div className="solve-sample-card" key={sample.id ?? index}>
                                                <div className="solve-sample-title">样例 {index + 1}</div>

                                                <div className="solve-sample-grid">
                                                    <div>
                                                        <div className="solve-sample-label">
                                                            <span>输入</span>

                                                            <Button
                                                                type="text"
                                                                size="small"
                                                                icon={<CopyOutlined/>}
                                                                onClick={() => copyText(sample.input)}
                                                            />
                                                        </div>

                                                        <pre>{sample.input || "无输入"}</pre>
                                                    </div>

                                                    <div>
                                                        <div className="solve-sample-label">
                                                            <span>输出</span>

                                                            <Button
                                                                type="text"
                                                                size="small"
                                                                icon={<CopyOutlined/>}
                                                                onClick={() => copyText(sample.expected_output)}
                                                            />
                                                        </div>

                                                        <pre>{sample.expected_output}</pre>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </Space>
                                </section>
                            )}

                            {problem.hint && (
                                <section className="solve-section">
                                    <Typography.Title level={4}>提示</Typography.Title>
                                    <div className="solve-hint">{problem.hint}</div>
                                </section>
                            )}
                        </div>
                    ) : (
                        <div className="solve-statement-scroll">
                            {user ? (
                                <ProblemSubmissionsPanel
                                    endpoint={`/contests/${id}/problems/${problemId}/submissions`}
                                    emptyText="你还没有在本场比赛的这道题提交过代码"
                                />
                            ) : (
                                <section className="solve-empty-tab">
                                    <Empty description="登录后可以查看你在本场比赛的提交记录"/>

                                    <Button type="primary" onClick={() => navigate("/login")}>
                                        去登录
                                    </Button>
                                </section>
                            )}
                        </div>
                    )}
                </section>

                <div
                    className="solve-resizer"
                    onPointerDown={startResize}
                    role="separator"
                    aria-label="调整题面和编辑器宽度"
                >
                    <span/>
                </div>

                <section className="solve-right-panel">
                    <header className="solve-editor-header">
                        <Space size={8}>
                            <Typography.Text className="solve-editor-label">语言：</Typography.Text>

                            <Select
                                value={language}
                                onChange={setLanguage}
                                style={{width: 150}}
                                options={languageOptions}
                            />

                            <Tooltip title="清空当前代码">
                                <Button icon={<ReloadOutlined/>} onClick={resetCode}/>
                            </Tooltip>
                        </Space>
                    </header>

                    <div className="solve-editor-area">
                        <Editor
                            height="100%"
                            language={monacoLanguage[language]}
                            theme={monacoTheme}
                            value={code}
                            onChange={(value) => setCode(value ?? "")}
                            options={{
                                minimap: {enabled: false},
                                fontSize: 14,
                                tabSize: 4,
                                wordWrap: "on",
                                smoothScrolling: true,
                                scrollBeyondLastLine: false,
                                automaticLayout: true,
                                padding: {
                                    top: 12,
                                    bottom: 12
                                }
                            }}
                        />
                    </div>

                    {
                        selfTestOpen && (
                            <SelfTestPanel
                                endpoint={`/contests/${id}/problems/${problemId}/run`}
                                language={language}
                                code={code}
                                samples={samples}
                            />
                        )
                    }

                    <footer className="solve-editor-footer">
                        <div className={user ? "solve-footer-tip" : "solve-footer-tip is-warning"}>
                            {user ? (
                                <>
                                    <CodeOutlined/>
                                    比赛代码草稿会自动保存在本地
                                </>
                            ) : (
                                <>
                                    <ClockCircleOutlined/>
                                    请先登录，登录后才能提交评测
                                </>
                            )}
                        </div>

                        <Space>
                            <Button icon={<PlayCircleOutlined/>} color={"green"} variant={"solid"}
                                    onClick={() => setSelfTestOpen(!selfTestOpen)}>
                                在线自测
                            </Button>
                            <Button
                                type="primary"
                                icon={<PlayCircleOutlined/>}
                                loading={submitting}
                                onClick={submit}
                            >
                                提交评测
                            </Button>
                        </Space>
                    </footer>
                </section>
            </div>

            <Drawer
                title="比赛题目列表"
                placement="left"
                width={440}
                open={drawerOpen}
                onClose={() => setDrawerOpen(false)}
                className="solve-problem-drawer"
            >
                <div className="solve-drawer-content">
                    <div className="solve-drawer-filters">
                        <Input
                            allowClear
                            prefix={<SearchOutlined/>}
                            placeholder="搜索比赛题目 / slug / P1"
                            value={problemKeyword}
                            onChange={(event) => setProblemKeyword(event.target.value)}
                        />

                        <Typography.Text type="secondary" className="solve-drawer-count">
                            已显示 {filteredContestProblems.length} / {contestProblems.length} 道题
                        </Typography.Text>
                    </div>

                    <div className="solve-problem-list-scroll" onScroll={handleProblemListScroll}>
                        <List
                            dataSource={filteredContestProblems}
                            locale={{emptyText: <Empty description="没有找到题目"/>}}
                            renderItem={(item) => {
                                const isCurrent = String(item.problem_id) === String(problemId);

                                return (
                                    <List.Item
                                        className={`solve-problem-switch-item ${
                                            isCurrent ? "is-current" : ""
                                        }`}
                                        onClick={() => switchContestProblem(item)}
                                    >
                                        <div className="solve-switch-main">
                                            <div className="solve-switch-title-row">
                                                <Typography.Text strong ellipsis>
                                                    {getContestProblemTitle(item)}
                                                </Typography.Text>

                                                <span className="solve-mini-status">{item.score} 分</span>
                                            </div>

                                            <Typography.Text type="secondary" className="solve-switch-slug">
                                                {item.problem.slug}
                                            </Typography.Text>

                                            <div className="solve-switch-rate">
                                                <span>题目 ID #{item.problem_id}</span>
                                                <span>排序 {item.sort_order}</span>
                                            </div>
                                        </div>
                                    </List.Item>
                                );
                            }}
                        />

                        <div className="solve-list-load-state">
                            {contestProblems.length > 0 && (
                                <Typography.Text type="secondary">已经到底啦</Typography.Text>
                            )}
                        </div>
                    </div>
                </div>
            </Drawer>
        </main>
    );
}