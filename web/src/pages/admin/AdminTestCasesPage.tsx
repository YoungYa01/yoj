import {ArrowLeftOutlined, DeleteOutlined, EditOutlined, PlusOutlined} from "@ant-design/icons";
import {
    Button,
    Checkbox,
    Flex,
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
import type {ColumnsType} from "antd/es/table";
import {useEffect, useState} from "react";
import {useNavigate, useParams} from "react-router-dom";
import {Problem, request, TestCase} from "../../api/client";
import AdminNav from "../../components/AdminNav";

interface TestCaseFormValues {
    input: string;
    expected_output: string;
    is_sample: boolean;
    sort_order: number;
}

export default function AdminTestCasesPage() {
    const {id} = useParams();
    const navigate = useNavigate();

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
            await request(`/admin/problems/${id}/test-cases/${row.id}`, {
                method: "DELETE"
            });

            message.success("测试点已删除");
            await load();
        } catch (error) {
            message.error((error as Error).message);
        }
    }

    const columns: ColumnsType<TestCase> = [
        {
            title: "顺序",
            dataIndex: "sort_order",
            width: 90
        },
        {
            title: "输入",
            dataIndex: "input",
            ellipsis: true
        },
        {
            title: "输出",
            dataIndex: "expected_output",
            ellipsis: true
        },
        {
            title: "样例",
            dataIndex: "is_sample",
            width: 90,
            render: (value: boolean) => (value ? "是" : "否")
        },
        {
            title: "操作",
            width: 200,
            render: (_, row) => (
                <Space>
                    <Button icon={<EditOutlined/>} onClick={() => openEdit(row)}>
                        编辑
                    </Button>

                    <Popconfirm title="确认删除该测试点？" onConfirm={() => remove(row)}>
                        <Button danger icon={<DeleteOutlined/>}>
                            删除
                        </Button>
                    </Popconfirm>
                </Space>
            )
        }
    ];

    return (
        <main className="page-stack">
            <AdminNav/>

            <section className="surface">
                <Space direction="vertical" size={16} className="full-width">
                    <Space className="list-toolbar" wrap>
                        <Flex>
                            <Button icon={<ArrowLeftOutlined/>} variant={"link"} color={"default"}
                                    onClick={() => navigate("/admin/problems")}></Button>

                            <Typography.Title level={3} style={{margin: 0}}>
                                测试点管理：{problem?.title ?? ""}
                            </Typography.Title>
                        </Flex>

                        <Button type="primary" icon={<PlusOutlined/>} onClick={openCreate} style={{marginLeft: "auto"}}>
                            新建测试点
                        </Button>
                    </Space>

                    <Table
                        rowKey="id"
                        loading={loading}
                        dataSource={cases}
                        columns={columns}
                        pagination={false}
                    />
                </Space>
            </section>

            <Modal
                title={editing ? "编辑测试点" : "新建测试点"}
                open={open}
                onCancel={() => setOpen(false)}
                onOk={save}
                destroyOnClose
            >
                <Form form={form} layout="vertical" initialValues={{is_sample: false, sort_order: 1}}>
                    <Form.Item
                        name="input"
                        label="输入"
                        rules={[{required: true, message: "请输入测试输入"}]}
                    >
                        <Input.TextArea rows={5}/>
                    </Form.Item>

                    <Form.Item
                        name="expected_output"
                        label="期望输出"
                        rules={[{required: true, message: "请输入期望输出"}]}
                    >
                        <Input.TextArea rows={5}/>
                    </Form.Item>

                    <Form.Item
                        name="sort_order"
                        label="排序"
                        rules={[{required: true, message: "请输入排序值"}]}
                    >
                        <InputNumber min={1} style={{width: "100%"}}/>
                    </Form.Item>

                    <Form.Item name="is_sample" valuePropName="checked">
                        <Checkbox>作为样例展示</Checkbox>
                    </Form.Item>
                </Form>
            </Modal>
        </main>
    );
}