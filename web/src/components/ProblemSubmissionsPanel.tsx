import { ReloadOutlined } from "@ant-design/icons";
import { Button, Empty, Space, Table, Tag, Typography } from "antd";
import type { ColumnsType } from "antd/es/table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { buildQuery, ListResponse, request, Submission } from "../api/client";
import { statusColor } from "../utils/status";

interface ProblemSubmissionsPanelProps {
    endpoint: string;
    emptyText?: string;
}

const PAGE_SIZE = 8;

const runningStatuses = new Set(["Pending", "Judging"]);

export default function ProblemSubmissionsPanel({
                                                    endpoint,
                                                    emptyText = "还没有提交记录"
                                                }: ProblemSubmissionsPanelProps) {
    const [loading, setLoading] = useState(false);
    const [data, setData] = useState<ListResponse<Submission>>({
        items: [],
        total: 0,
        page: 1,
        page_size: PAGE_SIZE
    });

    const hasRunningSubmission = useMemo(
        () => data.items.some((item) => runningStatuses.has(item.status)),
        [data.items]
    );

    const load = useCallback(
        async (page = data.page) => {
            setLoading(true);

            try {
                const query = buildQuery({
                    page,
                    page_size: PAGE_SIZE
                });

                const next = await request<ListResponse<Submission>>(`${endpoint}${query}`);
                setData(next);
            } finally {
                setLoading(false);
            }
        },
        [endpoint, data.page]
    );

    useEffect(() => {
        void load(1);
    }, [endpoint]);

    useEffect(() => {
        if (!hasRunningSubmission) {
            return;
        }

        const timer = window.setInterval(() => {
            void load(data.page);
        }, 1500);

        return () => window.clearInterval(timer);
    }, [hasRunningSubmission, data.page, load]);

    const columns: ColumnsType<Submission> = [
        {
            title: "提交",
            dataIndex: "id",
            width: 96,
            render: (id: number) => <Link to={`/submissions/${id}`}>#{id}</Link>
        },
        {
            title: "语言",
            dataIndex: "language",
            width: 92,
            render: (value: string) => <Tag>{value}</Tag>
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
            title: "内存",
            dataIndex: "memory_used_kb",
            width: 110,
            render: (value: number) => `${value} KB`
        },
        {
            title: "提交时间",
            dataIndex: "created_at",
            width: 170
        },
        {
            title: "操作",
            width: 86,
            render: (_, row) => <Link to={`/submissions/${row.id}`}>详情</Link>
        }
    ];

    return (
        <section className="solve-submissions-panel">
            <div className="solve-submissions-header">
                <div>
                    <Typography.Title level={4}>我的提交</Typography.Title>
                    <Typography.Text type="secondary">
                        共 {data.total} 条提交记录，Pending / Judging 会自动刷新。
                    </Typography.Text>
                </div>

                <Button icon={<ReloadOutlined />} loading={loading} onClick={() => load(data.page)}>
                    刷新
                </Button>
            </div>

            <Table
                rowKey="id"
                size="small"
                loading={loading}
                columns={columns}
                dataSource={data.items}
                locale={{
                    emptyText: <Empty description={emptyText} />
                }}
                scroll={{ x: 820 }}
                pagination={{
                    current: data.page,
                    total: data.total,
                    pageSize: data.page_size,
                    showSizeChanger: false,
                    onChange: (page) => load(page)
                }}
            />

            <Space className="solve-submissions-tip">
                <Typography.Text type="secondary">
                    点击提交编号或详情可以查看代码、样例输出和测试点结果。
                </Typography.Text>
            </Space>
        </section>
    );
}