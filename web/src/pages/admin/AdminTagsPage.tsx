import {
    CheckOutlined,
    CloseOutlined,
    DeleteOutlined,
    PlusOutlined,
    SearchOutlined
} from "@ant-design/icons";
import {
    Button,
    Form,
    Input,
    message,
    Modal,
    Popconfirm,
    Space,
    Table,
    Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AdminTag, buildQuery, ListResponse, request } from "../../api/client";
import AdminNav from "../../components/AdminNav";

interface TagFormValues {
    name: string;
}

const PAGE_SIZE = 20;

function getPage(searchParams: URLSearchParams) {
    const value = Number(searchParams.get("page"));
    return Number.isFinite(value) && value > 0 ? value : 1;
}

export default function AdminTagsPage() {
    const [searchParams, setSearchParams] = useSearchParams();

    const page = useMemo(() => getPage(searchParams), [searchParams]);
    const keyword = searchParams.get("keyword") ?? "";

    const [loading, setLoading] = useState(false);
    const [draftKeyword, setDraftKeyword] = useState(keyword);
    const [data, setData] = useState<ListResponse<AdminTag>>({
        items: [],
        total: 0,
        page: 1,
        page_size: PAGE_SIZE
    });

    const [open, setOpen] = useState(false);
    const [creating, setCreating] = useState(false);
    const [form] = Form.useForm<TagFormValues>();

    const [editingId, setEditingId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState("");
    const [savingId, setSavingId] = useState<number | null>(null);

    async function load() {
        setLoading(true);

        try {
            const query = buildQuery({
                page,
                page_size: PAGE_SIZE,
                keyword: keyword.trim()
            });

            const next = await request<ListResponse<AdminTag>>(`/admin/tags${query}`);
            setData(next);
        } finally {
            setLoading(false);
        }
    }

    function updateSearchParams(nextKeyword: string, nextPage = 1) {
        const next = new URLSearchParams();

        if (nextKeyword.trim()) {
            next.set("keyword", nextKeyword.trim());
        }

        next.set("page", String(nextPage));
        setSearchParams(next);
    }

    function search() {
        updateSearchParams(draftKeyword, 1);
    }

    function resetSearch() {
        setDraftKeyword("");
        updateSearchParams("", 1);
    }

    function openCreate() {
        form.setFieldsValue({ name: "" });
        setOpen(true);
    }

    async function createTag() {
        const values = await form.validateFields();

        setCreating(true);

        try {
            await request("/admin/tags", {
                method: "POST",
                body: JSON.stringify({
                    name: values.name.trim()
                })
            });

            message.success("标签已创建");
            setOpen(false);
            form.resetFields();
            await load();
        } catch (error) {
            message.error((error as Error).message);
        } finally {
            setCreating(false);
        }
    }

    function startEdit(row: AdminTag) {
        setEditingId(row.id);
        setEditingName(row.name);
    }

    function cancelEdit() {
        setEditingId(null);
        setEditingName("");
    }

    async function saveInlineEdit(row: AdminTag) {
        const nextName = editingName.trim();

        if (!nextName) {
            message.warning("标签名称不能为空");
            return;
        }

        if (nextName.length > 64) {
            message.warning("标签名称不能超过 64 个字符");
            return;
        }

        if (nextName === row.name) {
            cancelEdit();
            return;
        }

        setSavingId(row.id);

        try {
            await request(`/admin/tags/${row.id}`, {
                method: "PUT",
                body: JSON.stringify({
                    name: nextName
                })
            });

            message.success("标签已更新");
            cancelEdit();
            await load();
        } catch (error) {
            message.error((error as Error).message);
        } finally {
            setSavingId(null);
        }
    }

    async function remove(row: AdminTag) {
        try {
            await request(`/admin/tags/${row.id}`, {
                method: "DELETE"
            });

            message.success("标签已删除");

            if (editingId === row.id) {
                cancelEdit();
            }

            await load();
        } catch (error) {
            message.error((error as Error).message);
        }
    }

    useEffect(() => {
        setDraftKeyword(keyword);
    }, [keyword]);

    useEffect(() => {
        void load();
    }, [page, keyword]);

    const columns: ColumnsType<AdminTag> = [
        {
            title: "ID",
            dataIndex: "id",
            width: 80
        },
        {
            title: "标签",
            dataIndex: "name",
            render: (_, row) => {
                if (editingId === row.id) {
                    return (
                        <Space size={8} align="center">
                            <Input
                                autoFocus
                                variant="underlined"
                                value={editingName}
                                onChange={(event) => setEditingName(event.target.value)}
                                onPressEnter={() => saveInlineEdit(row)}
                                onKeyDown={(event) => {
                                    if (event.key === "Escape") {
                                        cancelEdit();
                                    }
                                }}
                                style={{ width: 220 }}
                            />

                            <Button
                                size="small"
                                type="primary"
                                icon={<CheckOutlined />}
                                loading={savingId === row.id}
                                onClick={() => saveInlineEdit(row)}
                            >
                                保存
                            </Button>

                            <Button
                                size="small"
                                icon={<CloseOutlined />}
                                disabled={savingId === row.id}
                                onClick={cancelEdit}
                            >
                                取消
                            </Button>
                        </Space>
                    );
                }

                return (
                    <Typography.Text
                        title="双击修改标签名称"
                        onDoubleClick={() => startEdit(row)}
                        style={{ cursor: "text", cursor: "pointer" }}
                    >
                        {row.name}
                    </Typography.Text>
                );
            }
        },
        {
            title: "关联题目",
            dataIndex: "problem_count",
            width: 120
        },
        {
            title: "创建时间",
            dataIndex: "created_at",
            width: 180
        },
        {
            title: "操作",
            width: 90,
            render: (_, row) => (
                <Popconfirm
                    title="删除标签会解除题目关联，确认删除？"
                    onConfirm={() => remove(row)}
                >
                    <Button danger icon={<DeleteOutlined />} />
                </Popconfirm>
            )
        }
    ];

    return (
        <main className="page-stack">
            <AdminNav />

            <div className="page-title-row">
                <Typography.Title level={2}>标签管理</Typography.Title>

                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    新建标签
                </Button>
            </div>

            <section className="toolbar">
                <Input
                    allowClear
                    prefix={<SearchOutlined />}
                    placeholder="搜索标签"
                    value={draftKeyword}
                    onChange={(event) => setDraftKeyword(event.target.value)}
                    onPressEnter={search}
                />

                <span />

                <Space>
                    <Button type="primary" onClick={search}>
                        筛选
                    </Button>

                    <Button onClick={resetSearch}>重置</Button>
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
                    onChange: (nextPage) => updateSearchParams(keyword, nextPage)
                }}
            />

            <Modal
                title="新建标签"
                open={open}
                onOk={createTag}
                onCancel={() => setOpen(false)}
                confirmLoading={creating}
                destroyOnClose
            >
                <Form form={form} layout="vertical" requiredMark={false}>
                    <Form.Item
                        name="name"
                        label="名称"
                        rules={[
                            { required: true, message: "请输入标签名称" },
                            { max: 64, message: "标签名称不能超过 64 个字符" }
                        ]}
                    >
                        <Input autoFocus />
                    </Form.Item>
                </Form>
            </Modal>
        </main>
    );
}