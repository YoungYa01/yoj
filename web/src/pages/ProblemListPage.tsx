import { SearchOutlined } from "@ant-design/icons";
import { Button, Input, Select, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { buildQuery, ListResponse, Problem, PublicTag, request } from "../api/client";
import { useAuth } from "../state/AuthContext";
import {
    getQueryNumber,
    getQueryString,
    setListSearchParams
} from "../utils/queryState";

interface ProblemFilters {
    keyword: string;
    difficulty?: string;
    tag?: string;
    status?: string;
}

const difficultyColor: Record<string, string> = {
    Easy: "green",
    Medium: "gold",
    Hard: "red"
};

function ProblemStatusBadge({ status }: { status?: string }) {
    if (status === "solved") {
        return <span className="problem-status-badge is-accepted">已通过</span>;
    }

    if (status === "attempted") {
        return <span className="problem-status-badge is-attempted">尝试过</span>;
    }

    return <span className="problem-status-badge">-</span>;
}

export default function ProblemListPage() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [searchParams, setSearchParams] = useSearchParams();

    const page = getQueryNumber(searchParams, "page", 1);

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
        page_size: 30
    });

    useEffect(() => {
        setDraftFilters(filters);
    }, [filters]);

    async function load() {
        setLoading(true);

        try {
            const query = buildQuery({
                page,
                page_size: data.page_size,
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

    function applyFilters() {
        setListSearchParams(searchParams, setSearchParams, {
            keyword: draftFilters.keyword.trim(),
            difficulty: draftFilters.difficulty,
            tag: draftFilters.tag,
            status: user ? draftFilters.status : undefined
        });
    }

    function resetFilters() {
        setDraftFilters({ keyword: "" });
        setSearchParams(new URLSearchParams({ page: "1" }));
    }

    useEffect(() => {
        void loadTags();
    }, []);

    useEffect(() => {
        void load();
    }, [page, filters.keyword, filters.difficulty, filters.tag, filters.status, user?.id]);

    const columns: ColumnsType<Problem> = [
        {
            title: "状态",
            width: 90,
            render: (_, row) => <ProblemStatusBadge status={row.accepted ? "solved" : row.attempted ? "attempted" : undefined} />
        },
        {
            title: "题目",
            render: (_, row) => <Link to={`/problems/${row.id}`}>{row.title}</Link>
        },
        {
            title: "难度",
            dataIndex: "difficulty",
            width: 110,
            render: (value: string) => <Tag color={difficultyColor[value]}>{value}</Tag>
        },
        {
            title: "标签",
            render: (_, row) => (
                <Space wrap>
                    {row.tags?.map((tag) => (
                        <Tag key={tag.id}>{tag.name}</Tag>
                    ))}
                </Space>
            )
        }
    ];

    return (
        <main className="page-stack">
            <section className="surface">
                <Space direction="vertical" size={16} className="full-width">
                    <div className="list-header">
                        <div>
                            <Typography.Title level={2}>题目列表</Typography.Title>
                            <Typography.Text type="secondary">选择一道题开始练习</Typography.Text>
                        </div>
                    </div>

                    <Space wrap>
                        <Input
                            allowClear
                            placeholder="搜索题目"
                            value={draftFilters.keyword}
                            onChange={(event) =>
                                setDraftFilters((prev) => ({ ...prev, keyword: event.target.value }))
                            }
                            onPressEnter={applyFilters}
                            style={{ width: 220 }}
                        />

                        <Select
                            allowClear
                            placeholder="难度"
                            value={draftFilters.difficulty}
                            onChange={(value) =>
                                setDraftFilters((prev) => ({ ...prev, difficulty: value }))
                            }
                            style={{ width: 140 }}
                            options={[
                                { label: "Easy", value: "Easy" },
                                { label: "Medium", value: "Medium" },
                                { label: "Hard", value: "Hard" }
                            ]}
                        />

                        <Select
                            allowClear
                            showSearch
                            placeholder="标签"
                            value={draftFilters.tag}
                            onChange={(value) => setDraftFilters((prev) => ({ ...prev, tag: value }))}
                            style={{ width: 160 }}
                            options={tags.map((tag) => ({ label: tag.name, value: tag.name }))}
                        />

                        {user && (
                            <Select
                                allowClear
                                placeholder="完成状态"
                                value={draftFilters.status}
                                onChange={(value) =>
                                    setDraftFilters((prev) => ({ ...prev, status: value }))
                                }
                                style={{ width: 140 }}
                                options={[
                                    { label: "已通过", value: "accepted" },
                                    { label: "尝试过", value: "attempted" },
                                    { label: "未尝试", value: "todo" }
                                ]}
                            />
                        )}

                        <Button type="primary" icon={<SearchOutlined />} onClick={applyFilters}>
                            查询
                        </Button>

                        <Button onClick={resetFilters}>重置</Button>
                    </Space>

                    <Table
                        rowKey="id"
                        loading={loading}
                        dataSource={data.items}
                        columns={columns}
                        pagination={{
                            current: data.page,
                            total: data.total,
                            pageSize: data.page_size,
                            onChange: (nextPage) =>
                                setListSearchParams(
                                    searchParams,
                                    setSearchParams,
                                    { page: nextPage },
                                    false
                                )
                        }}
                        onRow={(record) => ({
                            onDoubleClick: () => navigate(`/problems/${record.id}`)
                        })}
                    />
                </Space>
            </section>
        </main>
    );
}