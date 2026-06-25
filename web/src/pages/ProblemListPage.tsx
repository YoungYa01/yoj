import {
    CheckCircleFilled,
    ClockCircleOutlined,
    FilterOutlined,
    SearchOutlined,
    TagsOutlined
} from "@ant-design/icons";
import {
    Button,
    Input,
    Popover,
    Progress,
    Select,
    Space,
    Table,
    Tag,
    Tooltip,
    Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
    buildQuery,
    ListResponse,
    Problem,
    ProblemStatusStat,
    PublicTag,
    request
} from "../api/client";
import { useAuth } from "../state/AuthContext";

const PAGE_SIZE = 30;

interface ProblemFilters {
    keyword: string;
    difficulty?: string;
    tag?: string;
    status?: string;
}

const difficultyMeta: Record<string, { label: string; className: string }> = {
    Easy: { label: "入门", className: "difficulty-easy" },
    Medium: { label: "进阶", className: "difficulty-medium" },
    Hard: { label: "挑战", className: "difficulty-hard" }
};

const statusLabel: Record<string, string> = {
    Accepted: "AC",
    "Wrong Answer": "WA",
    "Time Limit Exceeded": "TLE",
    "Memory Limit Exceeded": "MLE",
    "Runtime Error": "RE",
    "Compile Error": "CE",
    "System Error": "SE",
    Pending: "PD",
    Judging: "JG"
};

const statusOrder = [
    "Accepted",
    "Wrong Answer",
    "Time Limit Exceeded",
    "Memory Limit Exceeded",
    "Runtime Error",
    "Compile Error",
    "System Error",
    "Pending",
    "Judging"
];

function getQueryNumber(searchParams: URLSearchParams, key: string, fallback = 1) {
    const value = Number(searchParams.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getQueryString(searchParams: URLSearchParams, key: string) {
    return searchParams.get(key) ?? "";
}

function statusKey(status: string) {
    return status.toLowerCase().replace(" ", "-");
}

function getOrderedStats(problem: Problem) {
    const stats = problem.status_stats ?? [];

    return [...stats].sort((a, b) => {
        const left = statusOrder.indexOf(a.status);
        const right = statusOrder.indexOf(b.status);

        if (left === -1 && right === -1) {
            return a.status.localeCompare(b.status);
        }

        if (left === -1) {
            return 1;
        }

        if (right === -1) {
            return -1;
        }

        return left - right;
    });
}

function UserProblemStatus({ problem }: { problem: Problem }) {
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

function ProblemResultStats({ problem }: { problem: Problem }) {
    const stats = getOrderedStats(problem);
    const passRate = Number((problem.pass_rate ?? 0).toFixed(2));

    const content = (
        <div className="problem-stat-popover">
            <div className="problem-stat-popover-title">
                <Typography.Text strong>提交结果分布</Typography.Text>
                <Typography.Text type="secondary">
                    共 {problem.submit_count} 次提交
                </Typography.Text>
            </div>

            {stats.length === 0 ? (
                <Typography.Text type="secondary">暂无提交统计</Typography.Text>
            ) : (
                <Space direction="vertical" size={8} className="full-width">
                    {stats.map((item) => (
                        <div key={item.status} className="problem-stat-row">
                            <span className={`stat-dot stat-${statusKey(item.status)}`} />

                            <span className="problem-stat-name">
                {statusLabel[item.status] ?? item.status}
              </span>

                            <Progress
                                percent={Number(item.rate.toFixed(2))}
                                size="small"
                                showInfo={false}
                            />

                            <span className="problem-stat-count">{item.count}</span>

                            <span className="problem-stat-rate">{item.rate.toFixed(2)}%</span>
                        </div>
                    ))}
                </Space>
            )}
        </div>
    );

    return (
        <Popover content={content} trigger="hover" placement="left">
            <div className="problem-result-cell">
                <div className="result-strip">
                    {stats.length > 0 ? (
                        stats.map((item) => (
                            <span
                                key={item.status}
                                className={`result-strip-piece stat-${statusKey(item.status)}`}
                                style={{ width: `${Math.max(item.rate, 1)}%` }}
                            />
                        ))
                    ) : (
                        <span className="result-strip-empty" />
                    )}
                </div>

                <div className="result-summary">
                    <Typography.Text strong>{passRate}%</Typography.Text>
                    <Typography.Text type="secondary">
                        AC {problem.accept_count}/{problem.submit_count}
                    </Typography.Text>
                </div>
            </div>
        </Popover>
    );
}

export default function ProblemListPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    const page = useMemo(() => getQueryNumber(searchParams, "page", 1), [searchParams]);

    const filters = useMemo<ProblemFilters>(
        () => ({
            keyword: getQueryString(searchParams, "keyword"),
            difficulty: getQueryString(searchParams, "difficulty") || undefined,
            tag: getQueryString(searchParams, "tag") || undefined,
            status: getQueryString(searchParams, "status") || undefined
        }),
        [searchParams]
    );

    const [draftFilters, setDraftFilters] = useState<ProblemFilters>(filters);
    const [loading, setLoading] = useState(false);
    const [tags, setTags] = useState<PublicTag[]>([]);
    const [data, setData] = useState<ListResponse<Problem>>({
        items: [],
        total: 0,
        page: 1,
        page_size: PAGE_SIZE
    });

    function writeSearchParams(nextFilters: ProblemFilters, nextPage = 1) {
        const next = new URLSearchParams();

        if (nextFilters.keyword.trim()) {
            next.set("keyword", nextFilters.keyword.trim());
        }

        if (nextFilters.difficulty) {
            next.set("difficulty", nextFilters.difficulty);
        }

        if (nextFilters.tag) {
            next.set("tag", nextFilters.tag);
        }

        if (user && nextFilters.status) {
            next.set("status", nextFilters.status);
        }

        next.set("page", String(nextPage));
        setSearchParams(next);
    }

    function search() {
        writeSearchParams(draftFilters, 1);
    }

    function resetFilters() {
        const emptyFilters: ProblemFilters = { keyword: "" };
        setDraftFilters(emptyFilters);
        writeSearchParams(emptyFilters, 1);
    }

    function applyTag(tagName: string) {
        const nextFilters = {
            ...draftFilters,
            tag: tagName
        };

        setDraftFilters(nextFilters);
        writeSearchParams(nextFilters, 1);
    }

    async function load() {
        setLoading(true);

        try {
            const query = buildQuery({
                page,
                page_size: PAGE_SIZE,
                keyword: filters.keyword.trim(),
                difficulty: filters.difficulty,
                tag: filters.tag,
                status: user ? filters.status : undefined
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

    useEffect(() => {
        setDraftFilters(filters);
    }, [filters]);

    useEffect(() => {
        void loadTags();
    }, []);

    useEffect(() => {
        void load();
    }, [page, filters.keyword, filters.difficulty, filters.tag, filters.status, user?.id]);

    const pageStats = useMemo(() => {
        const accepted = data.items.filter((item) => item.accepted).length;
        const attempted = data.items.filter((item) => item.attempted && !item.accepted).length;

        return { accepted, attempted };
    }, [data.items]);

    const columns: ColumnsType<Problem> = [
        {
            title: "状态",
            width: 92,
            render: (_, row) => <UserProblemStatus problem={row} />
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
                        <Tag
                            key={tag.id}
                            className="tag-chip clickable-tag"
                            onClick={() => applyTag(tag.name)}
                        >
                            {tag.name}
                        </Tag>
                    ))}

                    {items.length > 4 && <Tag className="tag-chip">+{items.length - 4}</Tag>}
                </Space>
            )
        },
        {
            title: "统计",
            width: 190,
            render: (_, row) => <ProblemResultStats problem={row} />
        },
        {
            title: "",
            width: 88,
            render: (_, row) => (
                <Button
                    type="link"
                    className="table-action-link"
                    onClick={() => navigate(`/problems/${row.id}`)}
                >
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
                        按题目、难度、标签和完成状态筛选题目，悬停统计区域查看 AC / WA / TLE 等提交占比。
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
                        <span>筛选题目</span>
                    </div>

                    <div className="filter-field">
                        <Typography.Text type="secondary" className="filter-label">
                            关键词
                        </Typography.Text>

                        <Input
                            allowClear
                            prefix={<SearchOutlined />}
                            placeholder="搜索题目名称 / slug"
                            value={draftFilters.keyword}
                            onChange={(event) =>
                                setDraftFilters((current) => ({
                                    ...current,
                                    keyword: event.target.value
                                }))
                            }
                            onPressEnter={search}
                        />
                    </div>

                    <div className="filter-field">
                        <Typography.Text type="secondary" className="filter-label">
                            难度
                        </Typography.Text>

                        <Select
                            allowClear
                            placeholder="全部难度"
                            value={draftFilters.difficulty}
                            onChange={(value) =>
                                setDraftFilters((current) => ({
                                    ...current,
                                    difficulty: value
                                }))
                            }
                            options={[
                                { label: "入门 Easy", value: "Easy" },
                                { label: "进阶 Medium", value: "Medium" },
                                { label: "挑战 Hard", value: "Hard" }
                            ]}
                        />
                    </div>

                    <div className="filter-field">
                        <Typography.Text type="secondary" className="filter-label">
                            我的状态
                        </Typography.Text>

                        <Select
                            allowClear
                            disabled={!user}
                            placeholder={user ? "全部状态" : "登录后可筛选"}
                            value={draftFilters.status}
                            onChange={(value) =>
                                setDraftFilters((current) => ({
                                    ...current,
                                    status: value
                                }))
                            }
                            options={[
                                { label: "未开始", value: "todo" },
                                { label: "已尝试", value: "attempted" },
                                { label: "已通过", value: "accepted" }
                            ]}
                        />
                    </div>

                    <div className="filter-field">
                        <Typography.Text type="secondary" className="filter-label">
                            标签
                        </Typography.Text>

                        <Select
                            allowClear
                            showSearch
                            suffixIcon={<TagsOutlined />}
                            placeholder="选择标签"
                            value={draftFilters.tag}
                            optionFilterProp="label"
                            onChange={(value) =>
                                setDraftFilters((current) => ({
                                    ...current,
                                    tag: value
                                }))
                            }
                            options={tags.map((tag) => ({
                                label: `${tag.name} (${tag.problem_count})`,
                                value: tag.name
                            }))}
                        />
                    </div>

                    <div className="filter-tag-cloud">
                        {tags.slice(0, 18).map((tag) => (
                            <button
                                key={tag.id}
                                type="button"
                                className={draftFilters.tag === tag.name ? "is-active" : ""}
                                onClick={() => applyTag(tag.name)}
                            >
                                {tag.name}
                                <span>{tag.problem_count}</span>
                            </button>
                        ))}
                    </div>

                    <Space className="filter-actions">
                        <Button type="primary" icon={<SearchOutlined />} onClick={search}>
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
                        rowClassName={(row) =>
                            row.accepted ? "problem-row-accepted" : row.attempted ? "problem-row-attempted" : ""
                        }
                        scroll={{ x: 980 }}
                        pagination={{
                            current: data.page,
                            total: data.total,
                            pageSize: data.page_size,
                            showSizeChanger: false,
                            showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
                            onChange: (nextPage) => writeSearchParams(filters, nextPage)
                        }}
                        onRow={(record) => ({
                            onDoubleClick: () => navigate(`/problems/${record.id}`)
                        })}
                    />
                </section>
            </section>
            <footer style={{textAlign: "center", paddingBottom: 16,marginTop: -30}}>
                copyright © {new Date().getFullYear()} &nbsp;
                <span style={{cursor: "pointer", fontSize: 16, color: "#429172"}}
                      onClick={() => window.open("https://github.com/YoungYa01/yoj")}
                > yoj-dev</span>
            </footer>
        </main>
    );
}