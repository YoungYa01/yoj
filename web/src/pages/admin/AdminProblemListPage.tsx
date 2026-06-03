import {DeleteOutlined, EditOutlined, PlusOutlined, UnorderedListOutlined} from "@ant-design/icons";
import {Button, message, Popconfirm, Space, Table, Tag, Typography} from "antd";
import type {ColumnsType} from "antd/es/table";
import {useEffect, useState} from "react";
import {Link, useNavigate} from "react-router-dom";
import {ListResponse, Problem, request} from "../../api/client";
import AdminNav from "../../components/AdminNav";

export default function AdminProblemListPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<ListResponse<Problem>>({items: [], total: 0, page: 1, page_size: 20});

    async function load(page = 1) {
        setLoading(true);
        try {
            const next = await request<ListResponse<Problem>>(`/admin/problems?page=${page}&page_size=${data.page_size}`);
            setData(next);
        } finally {
            setLoading(false);
        }
    }

    async function remove(id: number) {
        try {
            await request<void>(`/admin/problems/${id}`, {method: "DELETE"});
            message.success("已删除");
            void load(data.page);
        } catch (error) {
            message.error((error as Error).message);
        }
    }

    useEffect(() => {
        void load(1);
    }, []);

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
            render: (value: boolean) => <Tag color={value ? "green" : "default"}>{value ? "发布" : "草稿"}</Tag>
        },
        {
            title: "难度",
            dataIndex: "difficulty",
            width: 100,
            render: (value: string) => <Tag color={value === "Easy" ? "green" : value === "Medium" ? "blue" : "red"}>{value}</Tag>
        },
        {
            title: "测试点",
            render: (_, row) => (
                <Button
                    color={"primary"}
                    variant={"text"}
                    icon={<UnorderedListOutlined/>}
                    onClick={() => navigate(`/admin/problems/${row.id}/test-cases`)}>
                </Button>
            )
        },
        {
            title: "操作",
            width: 260,
            render: (_, row) => (
                <Space>
                    <Button icon={<EditOutlined/>} onClick={() => navigate(`/admin/problems/${row.id}/edit`)}>
                        编辑
                    </Button>

                    <Popconfirm title="确认删除该题目？" onConfirm={() => remove(row.id)}>
                        <Button danger icon={<DeleteOutlined/>}/>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <main className="page-stack">
            <AdminNav/>
            <div className="page-title-row">
                <Typography.Title level={2}>题目管理</Typography.Title>
                <Button type="primary" icon={<PlusOutlined/>} onClick={() => navigate("/admin/problems/new")}>
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
                    onChange: (page) => load(page)
                }}
            />
        </main>
    );
}
