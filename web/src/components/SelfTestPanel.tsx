import {
  CheckCircleFilled,
  CloseOutlined,
  CloseCircleFilled,
  ExclamationCircleFilled,
  PlayCircleOutlined
} from "@ant-design/icons";
import { Button, Input, message, Space, Tag, Typography } from "antd";
import { useEffect, useMemo, useState } from "react";
import { request, SelfTestResult, TestCase } from "../api/client";
import { statusColor } from "../utils/status";

interface SelfTestPanelProps {
  endpoint: string;
  language: string;
  code: string;
  samples?: TestCase[];
  onClose?: () => void;
}

const MAX_TEXT_LENGTH = 1000;

function getMessage(result: SelfTestResult | undefined, expectedOutput: string) {
  if (!result) {
    return undefined;
  }

  if (result.error_message) {
    return {
      type: "warning" as const,
      icon: <ExclamationCircleFilled />,
      title: "运行信息",
      description: result.error_message
    };
  }

  if (expectedOutput.trim() && result.status === "Accepted") {
    return {
      type: "success" as const,
      icon: <CheckCircleFilled />,
      title: "自测通过",
      description: "实际输出与预期输出一致。"
    };
  }

  if (expectedOutput.trim() && result.status === "Wrong Answer") {
    return {
      type: "error" as const,
      icon: <CloseCircleFilled />,
      title: "输出不一致",
      description: "实际输出与预期输出不一致。"
    };
  }

  return undefined;
}

export default function SelfTestPanel({
  endpoint,
  language,
  code,
  samples = [],
  onClose
}: SelfTestPanelProps) {
  const [input, setInput] = useState("");
  const [expectedOutput, setExpectedOutput] = useState("");
  const [result, setResult] = useState<SelfTestResult>();
  const [running, setRunning] = useState(false);

  const sampleButtons = useMemo(() => samples.slice(0, 3), [samples]);
  const resultMessage = getMessage(result, expectedOutput);

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
          <Typography.Text strong>在线自测</Typography.Text>
          <Typography.Text type="secondary" className="self-test-subtitle">
            不计入提交记录和通过率
          </Typography.Text>
        </div>

        <Space size={6} wrap>
          {sampleButtons.map((sample, index) => (
            <Button
              key={sample.id ?? index}
              size="small"
              onClick={() => fillSample(sample)}
            >
              样例 {index + 1}
            </Button>
          ))}

          <Button
            size="small"
            type="primary"
            icon={<PlayCircleOutlined />}
            loading={running}
            onClick={runSelfTest}
          >
            运行
          </Button>

          {onClose && (
            <Button size="small" icon={<CloseOutlined />} onClick={onClose} />
          )}
        </Space>
      </header>

      <div className="self-test-grid">
        <div className="self-test-field">
          <Typography.Text className="self-test-label">输入</Typography.Text>

          <Input.TextArea
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setResult(undefined);
            }}
            placeholder="标准输入"
            rows={3}
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
            placeholder="可选"
            rows={3}
            maxLength={MAX_TEXT_LENGTH}
            showCount
          />
        </div>

        <div className="self-test-output-field">
          <div className="self-test-output-title">
            <Typography.Text className="self-test-label">实际输出</Typography.Text>

            {result && (
              <Space size={6}>
                <Tag color={statusColor(result.status)}>{result.status}</Tag>
                <Typography.Text type="secondary">
                  {result.time_used_ms} ms
                </Typography.Text>
              </Space>
            )}
          </div>

          <pre className="self-test-output">
            {result ? result.output || "程序没有输出" : "运行后显示程序输出"}
          </pre>
        </div>
      </div>

      {resultMessage && (
        <div className={`self-test-message is-${resultMessage.type}`}>
          {resultMessage.icon}
          <div>
            <strong>{resultMessage.title}</strong>
            <span>{resultMessage.description}</span>
          </div>
        </div>
      )}
    </section>
  );
}
