import {
    ArrowLeftOutlined,
    DeleteOutlined,
    EditOutlined,
    PlusOutlined
} from "@ant-design/icons";
import {
    Button,
    Checkbox,
    Form,
    Input,
    InputNumber,
    message,
    Modal,
    Popconfirm,
    Space,
    Table,
    Typography
} from "antd";
import type { ColumnsType } from "antd/es/table";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Problem, request, TestCase } from "../../api/client";
import AdminNav from "../../components/AdminNav";

interface TestCaseFormValues {
    input: string;
    expected_output: string;
    is_sample: boolean;
    sort_order: number;
}

export default function AdminTestCasesPage() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const returnTo = useMemo(
        () => searchParams.get("returnTo") || "/admin/problems",
        [searchParams]
    );

    const [problem, setProblem] = useState<Problem>();
    const [cases, setCases] = useState<TestCase[]>([]);
    const [editing, setEditing] = useState<TestCase | null>(null);
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [form] = Form.useForm<TestCaseFormValues>();

    async function load() {
        setLoading(true);

        try {
            const [problemData, casesData] = await Promise.all([
                request<{ problem: Problem }>(`/admin/problems/${id}`),
                request<{ items: TestCase[] }>(`/admin/problems/${id}/test-cases`)
            ]);

            setProblem(problemData.problem);
            setCases(casesData.items);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, [id]);

    function openCreate() {
        setEditing(null);
        form.setFieldsValue({
            input: "",
            expected_output: "",
            is_sample: false,
            sort_order: cases.length + 1
        });
        setOpen(true);
    }

    function openEdit(row: TestCase) {
        setEditing(row);
        form.setFieldsValue({
            input: row.input,
            expected_output: row.expected_output,
            is_sample: row.is_sample,
            sort_order: row.sort_order
        });
        setOpen(true);
    }

    async function save() {
        const values = await form.validateFields();

        const payload = {
            input: values.input,
            expected_output: values.expected_output,
            is_sample: values.is_sample,
            sort_order: values.sort_order
        };

        try {
            if (editing) {
                await request(`/admin/test-cases/${editing.id}`, {
                    method: "PUT",
                    body: JSON.stringify(payload)
                });

                message.success("测试点已更新");
            } else {
                await request(`/admin/problems/${id}/test-cases`, {
                    method: "POST",
                    body: JSON.stringify(payload)
                });

                message.success("测试点已创建");
            }

            setOpen(false);
            await load();
        } catch (error) {
            message.error((error as Error).message);
        }
    }

    async function remove(row: TestCase) {
        try {
            await request(`/admin/test-cases/${row.id}`, { method: "DELETE" });

            message.success("已删除");
            await load();
        } catch (error) {
            message.error((error as Error).message);
        }
    }

    const columns: ColumnsType<TestCase> = [
        {
            title: "顺序",
            dataIndex: "sort_order",
            width: 80
        },
        {
            title: "输入",
            dataIndex: "input",
            render: (value: string) => <pre className="test-case-pre">{value || "无输入"}</pre>
        },
        {
            title: "期望输出",
            dataIndex: "expected_output",
            render: (value: string) => <pre className="test-case-pre">{value}</pre>
        },
        {
            title: "样例",
            dataIndex: "is_sample",
            width: 90,
            render: (value: boolean) => (value ? "是" : "否")
        },
        {
            title: "操作",
            width: 140,
            render: (_, row) => (
                <Space>
                    <Button icon={<EditOutlined />} onClick={() => openEdit(row)} />

                    <Popconfirm title="确认删除该测试点？" onConfirm={() => remove(row)}>
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
                <div>
                    <Space align="center">
                        <Button icon={<ArrowLeftOutlined />} variant={"text"} color={"default"} onClick={() => navigate(returnTo)}></Button>

                        <Typography.Title level={2} style={{ margin: 0 }}>
                            测试点管理: {problem?.id} - {problem?.title}
                        </Typography.Title>
                    </Space>
                </div>

                <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                    新建测试点
                </Button>
            </div>

            <Table
                className="test-case-table"
                tableLayout="fixed"
                rowKey="id"
                loading={loading}
                columns={columns}
                dataSource={cases}
                pagination={false}
            />

            <Modal
                title={editing ? "编辑测试点" : "新建测试点"}
                open={open}
                onOk={save}
                onCancel={() => setOpen(false)}
                destroyOnClose
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        name="input"
                        label="输入"
                        rules={[{ required: true, message: "请输入输入数据" }]}
                    >
                        <Input.TextArea rows={6} />
                    </Form.Item>

                    <Form.Item
                        name="expected_output"
                        label="期望输出"
                        rules={[{ required: true, message: "请输入期望输出" }]}
                    >
                        <Input.TextArea rows={6} />
                    </Form.Item>

                    <Form.Item
                        name="sort_order"
                        label="排序"
                        rules={[{ required: true, message: "请输入排序值" }]}
                    >
                        <InputNumber min={1} style={{ width: "100%" }} />
                    </Form.Item>

                    <Form.Item name="is_sample" valuePropName="checked">
                        <Checkbox>作为样例展示</Checkbox>
                    </Form.Item>
                </Form>
            </Modal>
        </main>
    );
}