import Editor from "@monaco-editor/react";
import {
    ArrowLeftOutlined,
    CheckCircleFilled,
    ClockCircleOutlined,
    CodeOutlined,
    CopyOutlined,
    MenuOutlined,
    PlayCircleOutlined,
    ReloadOutlined,
    SearchOutlined
} from "@ant-design/icons";
import {Button, Drawer, Empty, Input, List, message, Select, Space, Spin, Tabs, Tag, Tooltip, Typography} from "antd";
import type {CSSProperties, PointerEvent as ReactPointerEvent, UIEvent as ReactUIEvent} from "react";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {buildQuery, ListResponse, Problem, request, Submission} from "../api/client";
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

const languageOptions = [
    {label: "C++", value: "cpp"},
    {label: "C", value: "c"},
    {label: "Go", value: "go"},
    {label: "Python", value: "python"}
];

const difficultyOptions = [
    {label: "Easy", value: "Easy"},
    {label: "Medium", value: "Medium"},
    {label: "Hard", value: "Hard"}
];

const PROBLEM_SWITCH_PAGE_SIZE = 30;

function formatRate(value?: number) {
    return `${Number(value ?? 0).toFixed(2)}%`;
}

function problemStateText(problem: Problem) {
    if (problem.accepted) {
        return "已通过";
    }

    if (problem.attempted) {
        return "尝试过";
    }

    return "未开始";
}

function ProblemMiniStatus({problem}: { problem: Problem }) {
    if (problem.accepted) {
        return (
            <span className="solve-mini-status is-accepted">
        <CheckCircleFilled/>
        AC
      </span>
        );
    }

    if (problem.attempted) {
        return (
            <span className="solve-mini-status is-attempted">
        <ClockCircleOutlined/>
        TRY
      </span>
        );
    }

    return <span className="solve-mini-status">TODO</span>;
}

export default function ProblemDetailPage() {
    const {id} = useParams();
    const navigate = useNavigate();
    const {user} = useAuth();

    const {monacoTheme} = useThemeSettings();

    const splitRef = useRef<HTMLDivElement | null>(null);

    const [problem, setProblem] = useState<Problem>();
    const [problemLoading, setProblemLoading] = useState(false);
    const [language, setLanguage] = useState("cpp");
    const [code, setCode] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState("statement");
    const [selfTestOpen, setSelfTestOpen] = useState(false);

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [problemListLoading, setProblemListLoading] = useState(false);
    const [problemListLoadingMore, setProblemListLoadingMore] = useState(false);
    const [problemList, setProblemList] = useState<Problem[]>([]);
    const [problemListPage, setProblemListPage] = useState(1);
    const [problemListTotal, setProblemListTotal] = useState(0);
    const [problemListHasMore, setProblemListHasMore] = useState(true);
    const [problemKeyword, setProblemKeyword] = useState("");
    const [problemDifficulty, setProblemDifficulty] = useState<string | undefined>();

    const [leftWidth, setLeftWidth] = useState(() => {
        const cached = Number(localStorage.getItem("yoj_problem_split_width"));
        return Number.isFinite(cached) && cached >= 34 && cached <= 68 ? cached : 50;
    });

    const samples = useMemo(() => problem?.samples ?? [], [problem]);

    const draftKey = useMemo(() => {
        if (!id) {
            return "";
        }

        return `yoj_problem_${id}_${language}_code`;
    }, [id, language]);

    const pageStyle = {
        "--solve-left-width": `${leftWidth}%`
    } as CSSProperties;

    const loadProblem = useCallback(async () => {
        if (!id) {
            return;
        }

        setProblemLoading(true);

        try {
            const data = await request<{ problem: Problem }>(`/problems/${id}`);
            setProblem(data.problem);
        } catch (error) {
            message.error((error as Error).message);
        } finally {
            setProblemLoading(false);
        }
    }, [id]);

    async function loadProblemList(reset = true) {
        if (!drawerOpen) {
            return;
        }

        if (!reset && (!problemListHasMore || problemListLoading || problemListLoadingMore)) {
            return;
        }

        const nextPage = reset ? 1 : problemListPage + 1;

        if (reset) {
            setProblemListLoading(true);
            setProblemListHasMore(true);
        } else {
            setProblemListLoadingMore(true);
        }

        try {
            const query = buildQuery({
                page: nextPage,
                page_size: PROBLEM_SWITCH_PAGE_SIZE,
                keyword: problemKeyword.trim(),
                difficulty: problemDifficulty
            });

            const data = await request<ListResponse<Problem>>(`/problems${query}`);

            setProblemListPage(data.page);
            setProblemListTotal(data.total);
            setProblemListHasMore(data.page * data.page_size < data.total);

            if (reset) {
                setProblemList(data.items);
            } else {
                setProblemList((prev) => {
                    const existing = new Set(prev.map((item) => item.id));
                    const nextItems = data.items.filter((item) => !existing.has(item.id));
                    return [...prev, ...nextItems];
                });
            }
        } catch (error) {
            message.error((error as Error).message);
        } finally {
            if (reset) {
                setProblemListLoading(false);
            } else {
                setProblemListLoadingMore(false);
            }
        }
    }

    useEffect(() => {
        document.body.classList.add("problem-solve-mode");

        return () => {
            document.body.classList.remove("problem-solve-mode");
        };
    }, []);

    useEffect(() => {
        localStorage.setItem("yoj_problem_split_width", String(leftWidth));
    }, [leftWidth]);

    useEffect(() => {
        void loadProblem();
    }, [loadProblem]);

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

    useEffect(() => {
        if (!drawerOpen) {
            return;
        }

        const timer = window.setTimeout(() => {
            void loadProblemList(true);
        }, 240);

        return () => {
            window.clearTimeout(timer);
        };
    }, [drawerOpen, problemKeyword, problemDifficulty]);

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
            const data = await request<{ submission: Submission }>(`/problems/${id}/submit`, {
                method: "POST",
                body: JSON.stringify({language, code})
            });

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

    function switchProblem(nextProblem: Problem) {
        if (String(nextProblem.id) === String(id)) {
            setDrawerOpen(false);
            return;
        }

        setDrawerOpen(false);
        setActiveTab("statement");
        navigate(`/problems/${nextProblem.id}`);
    }

    function handleProblemListScroll(event: ReactUIEvent<HTMLDivElement>) {
        const target = event.currentTarget;
        const distanceToBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

        if (distanceToBottom <= 80) {
            void loadProblemList(false);
        }
    }

    if (problemLoading && !problem) {
        return (
            <main className="solve-loading">
                <Spin/>
                <Typography.Text type="secondary">正在加载题目...</Typography.Text>
            </main>
        );
    }

    if (!problem) {
        return (
            <main className="solve-loading">
                <Empty description="题目不存在或暂不可访问"/>
                <Button onClick={() => navigate("/")}>返回题库</Button>
            </main>
        );
    }

    return (
        <main className="problem-solve-page" style={pageStyle}>
            <div className="solve-split" ref={splitRef}>
                <section className="solve-left-panel">
                    <header className="solve-problem-tabs">
                        <Space size={8}>
                            <Tooltip title="题目列表">
                                <Button icon={<MenuOutlined/>} variant={"text"} color={"default"}
                                        onClick={() => setDrawerOpen(true)}/>
                            </Tooltip>

                            <Tooltip title="返回题库">
                                <Button icon={<ArrowLeftOutlined/>} variant={"text"} color={"default"}
                                        onClick={() => navigate("/")}/>
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
                                            Problem #{problem.id}
                                        </Typography.Text>

                                        <Typography.Title level={1}>{problem.title}</Typography.Title>
                                    </div>

                                    <ProblemMiniStatus problem={problem}/>
                                </div>

                                <Space size={[8, 8]} wrap>
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
                                    <span>时间限制</span>
                                    <strong>{problem.time_limit_ms} ms</strong>
                                </div>

                                <div>
                                    <span>内存限制</span>
                                    <strong>{problem.memory_limit_mb} MB</strong>
                                </div>

                                <div>
                                    <span>难度</span>
                                    <strong>{problem.difficulty}</strong>
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
                                    endpoint={`/problems/${id}/submissions`}
                                    emptyText="你还没有在这道题提交过代码"
                                />
                            ) : (
                                <section className="solve-empty-tab">
                                    <Empty description="登录后可以查看你在这道题的提交记录"/>

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

                    {selfTestOpen && (
                        <div className="solve-self-test-dock">
                            <SelfTestPanel
                                endpoint={`/problems/${id}/run`}
                                language={language}
                                code={code}
                                samples={samples}
                                onClose={() => setSelfTestOpen(false)}
                            />
                        </div>
                    )}

                    <footer className="solve-editor-footer">
                        <div className={user ? "solve-footer-tip" : "solve-footer-tip is-warning"}>
                            {user ? (
                                <>
                                    <CodeOutlined/>
                                    代码草稿会自动保存在本地
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
                title="题目列表"
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
                            placeholder="搜索题目名称 / slug"
                            value={problemKeyword}
                            onChange={(event) => setProblemKeyword(event.target.value)}
                        />

                        <Select
                            allowClear
                            placeholder="全部难度"
                            value={problemDifficulty}
                            onChange={setProblemDifficulty}
                            options={difficultyOptions}
                        />

                        <Typography.Text type="secondary" className="solve-drawer-count">
                            已加载 {problemList.length} / {problemListTotal} 道题
                        </Typography.Text>
                    </div>

                    <div className="solve-problem-list-scroll" onScroll={handleProblemListScroll}>
                        <List
                            loading={problemListLoading}
                            dataSource={problemList}
                            locale={{emptyText: <Empty description="没有找到题目"/>}}
                            renderItem={(item) => {
                                const isCurrent = String(item.id) === String(id);

                                return (
                                    <List.Item
                                        className={`solve-problem-switch-item ${isCurrent ? "is-current" : ""}`}
                                        onClick={() => switchProblem(item)}
                                    >
                                        <div className="solve-switch-main">
                                            <div className="solve-switch-title-row">
                                                <Typography.Text strong ellipsis>
                                                    #{item.id} {item.title}
                                                </Typography.Text>

                                                <ProblemMiniStatus problem={item}/>
                                            </div>

                                            <Typography.Text type="secondary" className="solve-switch-slug">
                                                {item.slug}
                                            </Typography.Text>

                                            <Space size={[6, 6]} wrap className="solve-switch-tags">
                                                <Tag color={difficultyColor[item.difficulty] ?? "default"}>
                                                    {item.difficulty}
                                                </Tag>

                                                {item.tags?.slice(0, 3).map((tag) => (
                                                    <Tag key={tag.id} className="solve-tag">
                                                        {tag.name}
                                                    </Tag>
                                                ))}
                                            </Space>

                                            <div className="solve-switch-rate">
                                                <span>通过率 {formatRate(item.pass_rate)}</span>
                                                <span>
                  AC {item.accept_count}/{item.submit_count}
                </span>
                                            </div>
                                        </div>
                                    </List.Item>
                                );
                            }}
                        />

                        <div className="solve-list-load-state">
                            {problemListLoadingMore && <Spin size="small"/>}

                            {!problemListLoading && !problemListLoadingMore && problemList.length > 0 && (
                                problemListHasMore ? (
                                    <Typography.Text type="secondary">继续向下滚动加载更多</Typography.Text>
                                ) : (
                                    <Typography.Text type="secondary">已经到底啦</Typography.Text>
                                )
                            )}
                        </div>
                    </div>
                </div>
            </Drawer>
        </main>
    );
}