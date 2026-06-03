import {
    DeleteOutlined,
    EditOutlined,
    PlusOutlined,
    UnorderedListOutlined
} from "@ant-design/icons";
import { Button, message, Popconfirm, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { ListResponse, Problem, request } from "../../api/client";
import AdminNav from "../../components/AdminNav";

const DEFAULT_PAGE_SIZE = 20;

function getQueryNumber(searchParams: URLSearchParams, key: string, fallback: number) {
    const value = Number(searchParams.get(key));
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

export default function AdminProblemListPage() {
    const navigate = useNavigate();
    const location = useLocation();
    const [searchParams, setSearchParams] = useSearchParams();

    const page = useMemo(() => getQueryNumber(searchParams, "page", 1), [searchParams]);
    const pageSize = useMemo(
        () => getQueryNumber(searchParams, "page_size", DEFAULT_PAGE_SIZE),
        [searchParams]
    );

    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<ListResponse<Problem>>({
        items: [],
        total: 0,
        page: 1,
        page_size: DEFAULT_PAGE_SIZE
    });

    async function load(nextPage = page, nextPageSize = pageSize) {
        setLoading(true);

        try {
            const next = await request<ListResponse<Problem>>(
                `/admin/problems?page=${nextPage}&page_size=${nextPageSize}`
            );

            setData(next);
        } finally {
            setLoading(false);
        }
    }

    function writePagination(nextPage: number, nextPageSize = pageSize) {
        const next = new URLSearchParams(searchParams);

        next.set("page", String(nextPage));
        next.set("page_size", String(nextPageSize));

        setSearchParams(next);
    }

    function buildReturnTo() {
        const search = location.search || `?page=${page}&page_size=${pageSize}`;
        return `/admin/problems${search}`;
    }

    function goTestCases(problemId: number) {
        navigate(
            `/admin/problems/${problemId}/test-cases?returnTo=${encodeURIComponent(
                buildReturnTo()
            )}`
        );
    }

    async function remove(id: number) {
        try {
            await request<void>(`/admin/problems/${id}`, { method: "DELETE" });
            message.success("已删除");
            await load(page, pageSize);
        } catch (error) {
            message.error((error as Error).message);
        }
    }

    useEffect(() => {
        void load(page, pageSize);
    }, [page, pageSize]);

    const columns: ColumnsType<Problem> = [
        {
            title: "ID",
            dataIndex: "id",
            width: 80
        },
        {
            title: "题目",
            render: (_, row) => <Link to={`/problems/${row.id}`}>{row.title}</Link>
        },
        {
            title: "Slug",
            dataIndex: "slug"
        },
        {
            title: "状态",
            dataIndex: "is_published",
            width: 90,
            render: (value: boolean) => (
                <Tag color={value ? "green" : "default"}>{value ? "发布" : "草稿"}</Tag>
            )
        },
        {
            title: "难度",
            dataIndex: "difficulty",
            width: 100
        },
        {
            title: "测试点",
            render: (_, row) => (
                <Button icon={<UnorderedListOutlined />} variant={"link"} color={"primary"} onClick={() => goTestCases(row.id)}></Button>
            )
        },
        {
            title: "操作",
            width: 260,
            render: (_, row) => (
                <Space>
                    <Button
                        icon={<EditOutlined />}
                        onClick={() =>
                            navigate(
                                `/admin/problems/${row.id}/edit?returnTo=${encodeURIComponent(
                                    buildReturnTo()
                                )}`
                            )
                        }
                    >
                    </Button>

                    <Popconfirm title="确认删除该题目？" onConfirm={() => remove(row.id)}>
                        <Button danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <main className="page-stack">
            <AdminNav />

            <div className="page-title-row">
                <Typography.Title level={2}>题目管理</Typography.Title>

                <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate("/admin/problems/new")}>
                    新建题目
                </Button>
            </div>

            <Table
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={data.items}
                pagination={{
                    current: data.page,
                    total: data.total,
                    pageSize: data.page_size,
                    onChange: (nextPage, nextPageSize) => writePagination(nextPage, nextPageSize)
                }}
            />
        </main>
    );
}