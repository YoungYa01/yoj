import { RedoOutlined, SearchOutlined } from "@ant-design/icons";
import {
    Button,
    Input,
    message,
    Popconfirm,
    Select,
    Space,
    Table,
    Tag,
    Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { buildQuery, ListResponse, request, Submission } from "../../api/client";
import AdminNav from "../../components/AdminNav";
import { statusColor } from "../../utils/status";

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

interface SubmissionFilters {
    status?: string;
    language?: string;
    userKeyword: string;
    problemKeyword: string;
}

function getQueryNumber(searchParams: URLSearchParams, key: string, fallback = 1) {
    const value = Number(searchParams.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function getQueryString(searchParams: URLSearchParams, key: string) {
    return searchParams.get(key) ?? "";
}

export default function AdminSubmissionsPage() {
    const [searchParams, setSearchParams] = useSearchParams();

    const page = useMemo(() => getQueryNumber(searchParams, "page", 1), [searchParams]);

    const filters = useMemo<SubmissionFilters>(
        () => ({
            status: getQueryString(searchParams, "status") || undefined,
            language: getQueryString(searchParams, "language") || undefined,

            // 兼容之前错误写进 URL 的 userKeyword / problemKeyword，
            // 但后续统一写成后端能识别的 user_keyword / problem_keyword。
            userKeyword:
                searchParams.get("user_keyword") ?? searchParams.get("userKeyword") ?? "",
            problemKeyword:
                searchParams.get("problem_keyword") ?? searchParams.get("problemKeyword") ?? ""
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

        if (nextFilters.status) {
            next.set("status", nextFilters.status);
        }

        if (nextFilters.language) {
            next.set("language", nextFilters.language);
        }

        if (nextFilters.userKeyword.trim()) {
            next.set("user_keyword", nextFilters.userKeyword.trim());
        }

        if (nextFilters.problemKeyword.trim()) {
            next.set("problem_keyword", nextFilters.problemKeyword.trim());
        }

        next.set("page", String(nextPage));

        setSearchParams(next);
    }

    function search() {
        writeSearchParams(draftFilters, 1);
    }

    function reset() {
        const emptyFilters: SubmissionFilters = {
            status: undefined,
            language: undefined,
            userKeyword: "",
            problemKeyword: ""
        };

        setDraftFilters(emptyFilters);
        writeSearchParams(emptyFilters, 1);
    }

    async function load() {
        setLoading(true);

        try {
            const query = buildQuery({
                page,
                page_size: PAGE_SIZE,
                status: filters.status,
                language: filters.language,
                user_keyword: filters.userKeyword.trim(),
                problem_keyword: filters.problemKeyword.trim()
            });

            const next = await request<ListResponse<Submission>>(`/admin/submissions${query}`);
            setData(next);
        } finally {
            setLoading(false);
        }
    }

    async function rejudge(row: Submission) {
        try {
            await request(`/admin/submissions/${row.id}/rejudge`, {
                method: "POST"
            });

            message.success("已重新加入判题队列");
            await load();
        } catch (error) {
            message.error((error as Error).message);
        }
    }

    useEffect(() => {
        setDraftFilters(filters);
    }, [filters]);

    useEffect(() => {
        void load();
    }, [
        page,
        filters.status,
        filters.language,
        filters.userKeyword,
        filters.problemKeyword
    ]);

    const columns: ColumnsType<Submission> = [
        {
            title: "ID",
            dataIndex: "id",
            width: 80,
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
            width: 150,
            render: (_, row) => (
                <Button
                    type="link"
                    className="link-button"
                    onClick={() =>
                        writeSearchParams(
                            {
                                ...filters,
                                userKeyword: row.user.username
                            },
                            1
                        )
                    }
                >
                    {row.user.username}
                </Button>
            )
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
            title: "耗时",
            dataIndex: "time_used_ms",
            width: 100,
            render: (value: number) => `${value} ms`
        },
        {
            title: "提交时间",
            dataIndex: "created_at",
            width: 180
        },
        {
            title: "操作",
            width: 110,
            render: (_, row) => (
                <Popconfirm title="确认重判这条提交？" onConfirm={() => rejudge(row)}>
                    <Button icon={<RedoOutlined />}>重判</Button>
                </Popconfirm>
            )
        }
    ];

    return (
        <main className="page-stack">
            <AdminNav />

            <Typography.Title level={2}>提交管理</Typography.Title>

            <section className="submission-filter-panel">

                <div className="submission-filter-grid">
                    <div className="filter-field">
                        <Typography.Text type="secondary" className="filter-label">
                            用户
                        </Typography.Text>

                        <Input
                            allowClear
                            prefix={<SearchOutlined />}
                            placeholder="输入用户名"
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
                            题目
                        </Typography.Text>

                        <Input
                            allowClear
                            prefix={<SearchOutlined />}
                            placeholder="输入题目名称 / slug"
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
                            options={statusOptions.map((value) => ({
                                label: value,
                                value
                            }))}
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
                            options={languageOptions.map((value) => ({
                                label: value,
                                value
                            }))}
                        />
                    </div>

                    <div className="submission-filter-actions">
                        <Button type="primary" icon={<SearchOutlined />} onClick={search}>
                            筛选
                        </Button>

                        <Button onClick={reset}>重置</Button>
                    </div>
                </div>
            </section>

            <Table
                rowKey="id"
                loading={loading}
                dataSource={data.items}
                columns={columns}
                pagination={{
                    current: data.page,
                    total: data.total,
                    pageSize: data.page_size,
                    onChange: (nextPage) => writeSearchParams(filters, nextPage)
                }}
            />
        </main>
    );
}