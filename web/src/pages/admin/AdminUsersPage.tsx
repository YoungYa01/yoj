import {SearchOutlined} from "@ant-design/icons";
import {Button, Input, message, Select, Space, Table, Tag, Typography} from "antd";
import type {ColumnsType} from "antd/es/table";
import {useEffect, useState} from "react";
import {useNavigate} from "react-router-dom";
import {AdminUser, buildQuery, ListResponse, request, Role} from "../../api/client";
import AdminNav from "../../components/AdminNav";

export default function AdminUsersPage() {
    const navigate = useNavigate();
    const [loading, setLoading] = useState(false);
    const [keyword, setKeyword] = useState("");
    const [role, setRole] = useState<Role | undefined>();
    const [data, setData] = useState<ListResponse<AdminUser>>({items: [], total: 0, page: 1, page_size: 20});

    async function load(page = 1) {
        setLoading(true);
        try {
            const query = buildQuery({page, page_size: data.page_size, keyword, role});
            const next = await request<ListResponse<AdminUser>>(`/admin/users${query}`);
            setData(next);
        } finally {
            setLoading(false);
        }
    }

    async function updateRole(user: AdminUser, nextRole: Role) {
        try {
            await request(`/admin/users/${user.id}/role`, {
                method: "PUT",
                body: JSON.stringify({role: nextRole})
            });
            message.success("角色已更新");
            await load(data.page);
        } catch (error) {
            message.error((error as Error).message);
        }
    }

    useEffect(() => {
        void load(1);
    }, []);

    const columns: ColumnsType<AdminUser> = [
        {
            title: "ID",
            dataIndex: "id",
            width: 80
        },
        {
            title: "用户名",
            dataIndex: "username"
        },
        {
            title: "角色",
            dataIndex: "role",
            width: 150,
            render: (value: Role, row) => (
                <Select
                    value={value}
                    onChange={(nextRole) => updateRole(row, nextRole)}
                    style={{width: 150}}
                    variant="borderless"
                    options={[
                        {label: "普通用户", value: "user"},
                        {label: "管理员", value: "admin"}
                    ]}
                />
            )
        },
        {
            title: "提交",
            dataIndex: "submission_count",
            width: 100
        },
        {
            title: "通过",
            dataIndex: "accepted_count",
            width: 100,
            render: (value: number) => <Tag color="green">{value}</Tag>
        },
        {
            title: "注册时间",
            dataIndex: "created_at",
            width: 180
        },
        {
            title: "操作",
            width: 130,
            render: (_, row) => (
                <Button onClick={() => navigate(`/admin/submissions?user_id=${row.id}`)}>
                    查看提交
                </Button>
            )
        }
    ];

    return (
        <main className="page-stack">
            <AdminNav/>
            <div className="page-title-row">
                <Typography.Title level={2}>用户管理</Typography.Title>
            </div>
            <section className="toolbar">
                <Input
                    allowClear
                    prefix={<SearchOutlined/>}
                    placeholder="搜索用户名"
                    value={keyword}
                    onChange={(event) => setKeyword(event.target.value)}
                    onPressEnter={() => load(1)}
                />
                <Select
                    allowClear
                    placeholder="角色"
                    value={role}
                    style={{width: 150}}
                    onChange={setRole}
                    options={[
                        {label: "普通用户", value: "user"},
                        {label: "管理员", value: "admin"}
                    ]}
                />
                <Space>
                    <Button type="primary" onClick={() => load(1)}>
                        筛选
                    </Button>
                    <Button
                        onClick={() => {
                            setKeyword("");
                            setRole(undefined);
                            load(data.page);
                        }}
                    >
                        重置
                    </Button>
                </Space>
            </section>
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
