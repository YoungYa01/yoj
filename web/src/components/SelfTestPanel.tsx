import { PlayCircleOutlined } from "@ant-design/icons";
import { Alert, Button, Input, message, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { request, SelfTestResult, TestCase } from "../api/client";
import { statusColor } from "../utils/status";

interface SelfTestPanelProps {
    endpoint: string;
    language: string;
    code: string;
    samples?: TestCase[];
}

const MAX_TEXT_LENGTH = 1000;

export default function SelfTestPanel({
                                          endpoint,
                                          language,
                                          code,
                                          samples = []
                                      }: SelfTestPanelProps) {
    const [input, setInput] = useState("");
    const [expectedOutput, setExpectedOutput] = useState("");
    const [result, setResult] = useState<SelfTestResult>();
    const [running, setRunning] = useState(false);

    const sampleButtons = useMemo(() => samples.slice(0, 3), [samples]);

    useEffect(() => {
        setResult(undefined);
    }, [endpoint, language]);

    function fillSample(sample: TestCase) {
        setInput(sample.input);
        setExpectedOutput(sample.expected_output);
        setResult(undefined);
    }

    async function runSelfTest() {
        if (!code.trim()) {
            message.warning("先写点代码再运行自测吧");
            return;
        }

        setRunning(true);

        try {
            const data = await request<{ result: SelfTestResult }>(endpoint, {
                method: "POST",
                body: JSON.stringify({
                    language,
                    code,
                    input,
                    expected_output: expectedOutput
                })
            });

            setResult(data.result);
        } catch (error) {
            message.error((error as Error).message);
        } finally {
            setRunning(false);
        }
    }

    return (
        <section className="self-test-panel">
            <header className="self-test-header">
                <div>
                    <Typography.Text strong>测试用例</Typography.Text>
                    <Typography.Text type="secondary" className="self-test-subtitle">
                        自测不会计入提交记录，也不会影响通过率。
                    </Typography.Text>
                </div>

                <Space wrap>
                    {sampleButtons.map((sample, index) => (
                        <Button key={sample.id ?? index} onClick={() => fillSample(sample)}>
                            填充样例 {index + 1}
                        </Button>
                    ))}

                    <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        loading={running}
                        onClick={runSelfTest}
                    >
                        运行自测
                    </Button>
                </Space>
            </header>

            <div className="self-test-grid">
                <div className="self-test-field">
                    <Typography.Text className="self-test-label">自测输入</Typography.Text>

                    <Input.TextArea
                        value={input}
                        onChange={(event) => {
                            setInput(event.target.value);
                            setResult(undefined);
                        }}
                        placeholder="请输入自测输入"
                        rows={4}
                        maxLength={MAX_TEXT_LENGTH}
                        showCount
                    />
                </div>

                <div className="self-test-field">
                    <Typography.Text className="self-test-label">预期输出</Typography.Text>

                    <Input.TextArea
                        value={expectedOutput}
                        onChange={(event) => {
                            setExpectedOutput(event.target.value);
                            setResult(undefined);
                        }}
                        placeholder="可选；填写后会自动对比输出"
                        rows={4}
                        maxLength={MAX_TEXT_LENGTH}
                        showCount
                    />
                </div>

                <div className="self-test-output-field">
                    <div className="self-test-output-title">
                        <Typography.Text className="self-test-label">实际输出</Typography.Text>

                        {result && (
                            <Space size={8}>
                                <Tag color={statusColor(result.status)}>{result.status}</Tag>
                                <Typography.Text type="secondary">
                                    {result.time_used_ms} ms
                                </Typography.Text>
                            </Space>
                        )}
                    </div>

                    <pre className="self-test-output">
            {result ? result.output || "程序没有输出" : "运行自测后，这里会显示实际输出"}
          </pre>
                </div>
            </div>

            {result?.error_message && (
                <Alert
                    className="self-test-alert"
                    type="warning"
                    showIcon
                    message="运行信息"
                    description={<pre className="self-test-error">{result.error_message}</pre>}
                />
            )}

            {result && expectedOutput.trim() && result.status === "Accepted" && (
                <Alert
                    className="self-test-alert"
                    type="success"
                    showIcon
                    message="自测通过"
                    description="实际输出与预期输出一致。"
                />
            )}

            {result && expectedOutput.trim() && result.status === "Wrong Answer" && (
                <Alert
                    className="self-test-alert"
                    type="error"
                    showIcon
                    message="输出不一致"
                    description="实际输出与预期输出不一致，请检查代码或预期输出。"
                />
            )}
        </section>
    );
}