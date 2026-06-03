import { DeleteOutlined, PlusOutlined } from "@ant-design/icons";
import { Button, Checkbox, Form, Input, InputNumber, message, Select, Space, Typography } from "antd";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Contest, ListResponse, Problem, request } from "../../api/client";
import AdminNav from "../../components/AdminNav";

interface ContestFormValues {
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  is_public: boolean;
  problems?: Array<{
    problem_id?: number;
    sort_order?: number;
    score?: number;
  }>;
}

interface ProblemOption {
  label: string;
  value: number;
}

function toDatetimeLocal(value: string) {
  if (!value) {
    return "";
  }
  return value.replace(" ", "T").slice(0, 16);
}

function defaultStartTime() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset() + 10);
  return date.toISOString().slice(0, 16);
}

function defaultEndTime() {
  const date = new Date();
  date.setHours(date.getHours() + 2);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function toProblemOption(problem: Problem): ProblemOption {
  return {
    value: problem.id,
    label: `#${problem.id} ${problem.title} (${problem.slug})`
  };
}

function mergeProblemOptions(base: ProblemOption[], extra: ProblemOption[]) {
  const map = new Map<number, ProblemOption>();
  [...extra, ...base].forEach((item) => map.set(item.value, item));
  return Array.from(map.values());
}

export default function AdminContestFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form] = Form.useForm<ContestFormValues>();
  const [problemOptions, setProblemOptions] = useState<ProblemOption[]>([]);
  const [problemLoading, setProblemLoading] = useState(false);
  const isEdit = Boolean(id);

  async function loadProblemOptions(keyword = "") {
    setProblemLoading(true);
    try {
      const data = await request<ListResponse<Problem>>(
        `/admin/problems?page=1&page_size=50${keyword ? `&keyword=${encodeURIComponent(keyword)}` : ""}`
      );
      setProblemOptions((current) => mergeProblemOptions(data.items.map(toProblemOption), current));
    } finally {
      setProblemLoading(false);
    }
  }

  useEffect(() => {
    void loadProblemOptions();
  }, []);

  useEffect(() => {
    async function load() {
      if (!id) {
        form.setFieldsValue({
          is_public: true,
          start_time: defaultStartTime(),
          end_time: defaultEndTime(),
          problems: [{ sort_order: 1, score: 100 }]
        });
        return;
      }
      const data = await request<{ contest: Contest }>(`/admin/contests/${id}`);
      const selectedOptions =
        data.contest.problems?.map((item) => ({
          value: item.problem_id,
          label: `#${item.problem_id} ${item.problem.title} (${item.problem.slug})`
        })) ?? [];
      setProblemOptions((current) => mergeProblemOptions(current, selectedOptions));
      form.setFieldsValue({
        title: data.contest.title,
        description: data.contest.description,
        start_time: toDatetimeLocal(data.contest.start_time),
        end_time: toDatetimeLocal(data.contest.end_time),
        is_public: data.contest.is_public,
        problems: data.contest.problems?.map((item) => ({
          problem_id: item.problem_id,
          sort_order: item.sort_order,
          score: item.score
        }))
      });
    }
    void load();
  }, [id, form]);

  async function onFinish(values: ContestFormValues) {
    const problems = (values.problems ?? [])
      .filter((item) => item.problem_id)
      .map((item, index) => ({
        problem_id: item.problem_id,
        sort_order: item.sort_order || index + 1,
        score: item.score || 100
      }));
    const payload = { ...values, problems };
    try {
      if (isEdit) {
        await request(`/admin/contests/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        message.success("比赛已更新");
      } else {
        await request("/admin/contests", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        message.success("比赛已创建");
      }
      navigate("/admin/contests");
    } catch (error) {
      message.error((error as Error).message);
    }
  }

  return (
    <main className="page-stack">
      <AdminNav />
      <div className="page-title-row">
        <Typography.Title level={2}>{isEdit ? "编辑比赛" : "新建比赛"}</Typography.Title>
      </div>
      <section className="surface form-surface">
        <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
          <div className="form-grid">
            <Form.Item name="title" label="标题" rules={[{ required: true, message: "请输入标题" }]}>
              <Input />
            </Form.Item>
            <Form.Item name="is_public" valuePropName="checked" label="可见性">
              <Checkbox>公开比赛</Checkbox>
            </Form.Item>
            <Form.Item name="start_time" label="开始时间" rules={[{ required: true, message: "请选择开始时间" }]}>
              <Input type="datetime-local" />
            </Form.Item>
            <Form.Item name="end_time" label="结束时间" rules={[{ required: true, message: "请选择结束时间" }]}>
              <Input type="datetime-local" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={4} />
          </Form.Item>
          <div className="section-title-row">
            <Typography.Title level={4}>比赛题目</Typography.Title>
            <Typography.Text type="secondary">通过题目标题、Slug 或 ID 搜索选择</Typography.Text>
          </div>
          <Form.List name="problems">
            {(fields, { add, remove }) => (
              <Space direction="vertical" className="full-width">
                {fields.map((field, index) => (
                  <div className="contest-problem-row" key={field.key}>
                    <Form.Item
                      {...field}
                      name={[field.name, "problem_id"]}
                      label={index === 0 ? "题目" : undefined}
                      rules={[{ required: true, message: "请选择题目" }]}
                    >
                      <Select
                        showSearch
                        allowClear
                        filterOption={false}
                        loading={problemLoading}
                        placeholder="搜索并选择题目"
                        options={problemOptions}
                        onSearch={loadProblemOptions}
                      />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, "sort_order"]} label={index === 0 ? "顺序" : undefined}>
                      <InputNumber min={1} className="full-width" />
                    </Form.Item>
                    <Form.Item {...field} name={[field.name, "score"]} label={index === 0 ? "分值" : undefined}>
                      <InputNumber min={1} className="full-width" />
                    </Form.Item>
                    <Button className="contest-problem-delete" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)} />
                  </div>
                ))}
                <Button icon={<PlusOutlined />} onClick={() => add({ sort_order: fields.length + 1, score: 100 })}>
                  添加题目
                </Button>
              </Space>
            )}
          </Form.List>
          <Space className="mt-16">
            <Button type="primary" htmlType="submit">
              保存
            </Button>
            <Button onClick={() => navigate("/admin/contests")}>取消</Button>
          </Space>
        </Form>
      </section>
    </main>
  );
}
