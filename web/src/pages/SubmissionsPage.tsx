import { SearchOutlined } from "@ant-design/icons";
import {
    Button,
    Input,
    Segmented,
    Select,
    Space,
    Table,
    Tag,
    Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { buildQuery, ListResponse, request, Submission } from "../api/client";
import { statusColor } from "../utils/status";

type Scope = "all" | "mine";

interface SubmissionFilters {
    scope: Scope;
    status?: string;
    language?: string;
    problemKeyword: string;
    userKeyword: string;
}

const PAGE_SIZE = 20;

const statusOptions = [
    "Pending",
    "Judging",
    "Accepted",
    "Wrong Answer",
    "Compile Error",
    "Runtime Error",
    "Time Limit Exceeded",
    "Memory Limit Exceeded",
    "System Error"
];

const languageOptions = ["go", "c", "cpp", "python"];

function getQueryNumber(searchParams: URLSearchParams, key: string, fallback = 1) {
    const value = Number(searchParams.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getQueryString(searchParams: URLSearchParams, key: string) {
    return searchParams.get(key) ?? "";
}

function getScope(searchParams: URLSearchParams): Scope {
    return searchParams.get("scope") === "mine" ? "mine" : "all";
}

export default function SubmissionsPage() {
    const [searchParams, setSearchParams] = useSearchParams();

    const page = useMemo(() => getQueryNumber(searchParams, "page", 1), [searchParams]);

    const filters = useMemo<SubmissionFilters>(
        () => ({
            scope: getScope(searchParams),
            status: getQueryString(searchParams, "status") || undefined,
            language: getQueryString(searchParams, "language") || undefined,
            problemKeyword: getQueryString(searchParams, "problem_keyword"),
            userKeyword: getQueryString(searchParams, "user_keyword")
        }),
        [searchParams]
    );

    const [loading, setLoading] = useState(false);
    const [draftFilters, setDraftFilters] = useState<SubmissionFilters>(filters);
    const [data, setData] = useState<ListResponse<Submission>>({
        items: [],
        total: 0,
        page: 1,
        page_size: PAGE_SIZE
    });

    function writeSearchParams(nextFilters: SubmissionFilters, nextPage = 1) {
        const next = new URLSearchParams();

        if (nextFilters.scope === "mine") {
            next.set("scope", "mine");
        }

        if (nextFilters.status) {
            next.set("status", nextFilters.status);
        }

        if (nextFilters.language) {
            next.set("language", nextFilters.language);
        }

        if (nextFilters.problemKeyword.trim()) {
            next.set("problem_keyword", nextFilters.problemKeyword.trim());
        }

        if (nextFilters.scope === "all" && nextFilters.userKeyword.trim()) {
            next.set("user_keyword", nextFilters.userKeyword.trim());
        }

        next.set("page", String(nextPage));
        setSearchParams(next);
    }

    async function load() {
        setLoading(true);

        try {
            const query = buildQuery({
                page,
                page_size: PAGE_SIZE,
                status: filters.status,
                language: filters.language,
                mine: filters.scope === "mine" ? 1 : undefined,
                problem_keyword: filters.problemKeyword.trim(),
                user_keyword: filters.scope === "all" ? filters.userKeyword.trim() : undefined
            });

            const next = await request<ListResponse<Submission>>(`/submissions${query}`);
            setData(next);
        } finally {
            setLoading(false);
        }
    }

    function search() {
        writeSearchParams(draftFilters, 1);
    }

    function reset() {
        const emptyFilters: SubmissionFilters = {
            scope: "all",
            status: undefined,
            language: undefined,
            problemKeyword: "",
            userKeyword: ""
        };

        setDraftFilters(emptyFilters);
        writeSearchParams(emptyFilters, 1);
    }

    function changeScope(nextScope: Scope) {
        const nextFilters: SubmissionFilters = {
            ...draftFilters,
            scope: nextScope,
            userKeyword: nextScope === "mine" ? "" : draftFilters.userKeyword
        };

        setDraftFilters(nextFilters);
        writeSearchParams(nextFilters, 1);
    }

    useEffect(() => {
        setDraftFilters(filters);
    }, [filters]);

    useEffect(() => {
        void load();
    }, [
        page,
        filters.scope,
        filters.status,
        filters.language,
        filters.problemKeyword,
        filters.userKeyword
    ]);

    const columns: ColumnsType<Submission> = [
        {
            title: "提交",
            dataIndex: "id",
            width: 96,
            render: (id: number) => <Link to={`/submissions/${id}`}>#{id}</Link>
        },
        {
            title: "题目",
            render: (_, row) => (
                <Space direction="vertical" size={0}>
                    <Link to={`/problems/${row.problem.id}`}>{row.problem.title}</Link>

                    {row.problem.slug && (
                        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                            {row.problem.slug}
                        </Typography.Text>
                    )}
                </Space>
            )
        },
        {
            title: "用户",
            width: 140,
            render: (_, row) => (
                <Button
                    type="link"
                    className="link-button"
                    onClick={() => {
                        const nextFilters: SubmissionFilters = {
                            ...draftFilters,
                            scope: "all",
                            userKeyword: row.user.username
                        };

                        setDraftFilters(nextFilters);
                        writeSearchParams(nextFilters, 1);
                    }}
                >
                    {row.user.username}
                </Button>
            )
        },
        {
            title: "语言",
            dataIndex: "language",
            width: 100,
            render: (value: string) => <Tag>{value}</Tag>
        },
        {
            title: "状态",
            dataIndex: "status",
            width: 180,
            render: (value: string) => <Tag color={statusColor(value)}>{value}</Tag>
        },
        {
            title: "耗时",
            dataIndex: "time_used_ms",
            width: 100,
            render: (value: number) => `${value} ms`
        },
        {
            title: "内存",
            dataIndex: "memory_used_kb",
            width: 110,
            render: (value: number) => `${value} KB`
        },
        {
            title: "提交时间",
            dataIndex: "created_at",
            width: 180
        }
    ];

    return (
        <main className="page-stack">
            <section className="page-hero compact">
                <div>
                    <Typography.Text className="eyebrow">Submissions</Typography.Text>
                    <Typography.Title level={1}>提交记录</Typography.Title>
                    <Typography.Paragraph>
                        查看提交状态；代码内容仅提交者本人可见。
                    </Typography.Paragraph>
                </div>

                <div className="hero-metrics">
                    <div>
                        <span>{data.total}</span>
                        <label>匹配记录</label>
                    </div>

                    <div>
                        <span>{data.items.filter((item) => item.status === "Accepted").length}</span>
                        <label>本页通过</label>
                    </div>
                </div>
            </section>

            <section className="submission-filter-panel">
                <div className="submission-filter-header">
                    <div>
                        <Typography.Text strong>筛选条件</Typography.Text>
                        <Typography.Text type="secondary" className="submission-filter-tip">
                            支持按题目名称、题目 slug、用户名、状态和语言筛选。
                        </Typography.Text>
                    </div>

                    <Segmented
                        value={draftFilters.scope}
                        onChange={(value) => changeScope(value as Scope)}
                        options={[
                            { label: "全部提交", value: "all" },
                            { label: "我的提交", value: "mine" }
                        ]}
                    />
                </div>

                <div className="submission-filter-grid">
                    <div className="filter-field filter-field-problem">
                        <Typography.Text type="secondary" className="filter-label">
                            题目
                        </Typography.Text>

                        <Input
                            allowClear
                            prefix={<SearchOutlined />}
                            placeholder="题目名称 / slug"
                            value={draftFilters.problemKeyword}
                            onChange={(event) =>
                                setDraftFilters((prev) => ({
                                    ...prev,
                                    problemKeyword: event.target.value
                                }))
                            }
                            onPressEnter={search}
                        />
                    </div>

                    <div className="filter-field filter-field-user">
                        <Typography.Text type="secondary" className="filter-label">
                            用户
                        </Typography.Text>

                        <Input
                            allowClear
                            disabled={draftFilters.scope === "mine"}
                            prefix={<SearchOutlined />}
                            placeholder={draftFilters.scope === "mine" ? "我的提交无需筛用户" : "用户名"}
                            value={draftFilters.userKeyword}
                            onChange={(event) =>
                                setDraftFilters((prev) => ({
                                    ...prev,
                                    userKeyword: event.target.value
                                }))
                            }
                            onPressEnter={search}
                        />
                    </div>

                    <div className="filter-field">
                        <Typography.Text type="secondary" className="filter-label">
                            状态
                        </Typography.Text>

                        <Select
                            allowClear
                            placeholder="全部状态"
                            value={draftFilters.status}
                            onChange={(value) =>
                                setDraftFilters((prev) => ({
                                    ...prev,
                                    status: value
                                }))
                            }
                            options={statusOptions.map((value) => ({ label: value, value }))}
                        />
                    </div>

                    <div className="filter-field">
                        <Typography.Text type="secondary" className="filter-label">
                            语言
                        </Typography.Text>

                        <Select
                            allowClear
                            placeholder="全部语言"
                            value={draftFilters.language}
                            onChange={(value) =>
                                setDraftFilters((prev) => ({
                                    ...prev,
                                    language: value
                                }))
                            }
                            options={languageOptions.map((value) => ({ label: value, value }))}
                        />
                    </div>

                    <div className="submission-filter-actions">
                        <Button type="primary" icon={<SearchOutlined />} onClick={search}>
                            查询
                        </Button>

                        <Button onClick={reset}>重置</Button>
                    </div>
                </div>
            </section>

            <section className="surface table-surface">
                <Table
                    rowKey="id"
                    loading={loading}
                    columns={columns}
                    dataSource={data.items}
                    scroll={{ x: 980 }}
                    pagination={{
                        current: data.page,
                        total: data.total,
                        pageSize: data.page_size,
                        showSizeChanger: false,
                        showTotal: (total, range) => `${range[0]}-${range[1]} / ${total}`,
                        onChange: (nextPage) => writeSearchParams(filters, nextPage)
                    }}
                />
            </section>
        </main>
    );
}