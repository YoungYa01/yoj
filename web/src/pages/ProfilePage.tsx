import {
    CameraOutlined,
    CheckCircleOutlined,
    CloseOutlined,
    FireOutlined,
    LockOutlined,
    PictureOutlined,
    SaveOutlined,
    UserOutlined
} from "@ant-design/icons";
import {
    Avatar,
    Button,
    Card,
    Col,
    Drawer,
    Form,
    Input,
    message,
    Row,
    Space,
    Statistic,
    Tag,
    Tooltip,
    Typography
} from "antd";
import {ChangeEvent, useEffect, useMemo, useRef, useState} from "react";
import {ActivityDay, assetURL, ProfileStats, request, User} from "../api/client";
import {useAuth} from "../state/AuthContext";

interface ProfileResponse {
    user: User;
    stats: ProfileStats;
}

interface ActivityResponse {
    items: ActivityDay[];
    active_days: number;
}

interface PasswordFormValues {
    old_password: string;
    new_password: string;
    confirm_password: string;
}

interface HeatmapCell {
    key: string;
    blank: boolean;
    day?: ActivityDay;
    level?: number;
    score?: number;
}

interface HeatmapScale {
    thresholds: number[];
    maxScore: number;
}

const MONTH_LABELS = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"];

function parseLocalDate(value: string) {
    const [year, month, day] = value.split("-").map(Number);
    return new Date(year, month - 1, day);
}

function formatDateLabel(value: string) {
    const date = parseLocalDate(value);
    const month = date.getMonth() + 1;
    const day = date.getDate();

    return `${month}月${day}日`;
}

function activityScore(day: ActivityDay) {
    // 做题活跃度不只看提交次数：AC 和解题也应该让颜色更深。
    return day.submissions + day.accepted_submissions * 2 + day.solved * 3;
}

function quantile(sorted: number[], ratio: number) {
    if (sorted.length === 0) {
        return 0;
    }

    const index = Math.ceil(sorted.length * ratio) - 1;
    return sorted[Math.max(0, Math.min(sorted.length - 1, index))];
}

function buildHeatmapScale(items: ActivityDay[]): HeatmapScale {
    const scores = items.map(activityScore).filter((score) => score > 0).sort((a, b) => a - b);
    const uniqueScores = Array.from(new Set(scores));

    if (scores.length === 0) {
        return {
            thresholds: [0, 0, 0],
            maxScore: 0
        };
    }

    if (uniqueScores.length === 1) {
        const only = uniqueScores[0];

        return {
            thresholds: [only, only, only],
            maxScore: only
        };
    }

    return {
        thresholds: [
            quantile(scores, 0.25),
            quantile(scores, 0.5),
            quantile(scores, 0.75)
        ],
        maxScore: scores[scores.length - 1]
    };
}

function activityLevel(day: ActivityDay, scale: HeatmapScale) {
    const score = activityScore(day);

    if (score <= 0) {
        return 0;
    }

    const [low, mid, high] = scale.thresholds;

    if (scale.maxScore === score && score > high) {
        return 4;
    }

    if (low === mid && mid === high) {
        return 2;
    }

    if (score <= low) {
        return 1;
    }

    if (score <= mid) {
        return 2;
    }

    if (score < high) {
        return 3;
    }

    return 4;
}

function formatPercent(value: number) {
    if (!Number.isFinite(value)) return "0%";
    return `${Math.round(value)}%`;
}

function buildHeatmapCells(items: ActivityDay[]) {
    if (items.length === 0) {
        return {
            cells: [] as HeatmapCell[],
            weekCount: 0,
            monthMarkers: [] as { week: number; label: string }[],
            scale: {thresholds: [0, 0, 0], maxScore: 0} as HeatmapScale
        };
    }

    const scale = buildHeatmapScale(items);
    const firstWeekday = parseLocalDate(items[0].date).getDay();
    const blanks: HeatmapCell[] = Array.from({length: firstWeekday}, (_, index) => ({
        key: `blank-${index}`,
        blank: true
    }));

    const cells: HeatmapCell[] = items.map((day) => ({
        key: day.date,
        blank: false,
        day,
        level: activityLevel(day, scale),
        score: activityScore(day)
    }));

    const allCells = [...blanks, ...cells];
    const weekCount = Math.ceil(allCells.length / 7);
    const markerMap = new Map<number, string>();

    items.forEach((day, index) => {
        const date = parseLocalDate(day.date);
        const cellIndex = firstWeekday + index;
        const week = Math.floor(cellIndex / 7);

        if (date.getDate() <= 7 && !markerMap.has(week)) {
            markerMap.set(week, MONTH_LABELS[date.getMonth()]);
        }
    });

    return {
        cells: allCells,
        weekCount,
        scale,
        monthMarkers: Array.from(markerMap.entries()).map(([week, label]) => ({week, label}))
    };
}

function currentStreak(items: ActivityDay[]) {
    let streak = 0;

    for (let index = items.length - 1; index >= 0; index--) {
        if ((items[index]?.submissions ?? 0) <= 0) break;
        streak++;
    }

    return streak;
}

function recentActiveDays(items: ActivityDay[], days: number) {
    return items.slice(-days).filter((item) => item.submissions > 0).length;
}

function HeatmapTooltipContent({day, score}: { day: ActivityDay; score: number }) {
    const hasActivity = day.submissions > 0;

    return (
        <div className="profile-heatmap-tooltip-content">
            <strong>{formatDateLabel(day.date)}</strong>

            {hasActivity ? (
                <>
                    <span>提交 {day.submissions} 次</span>
                    <span>通过 {day.accepted_submissions} 次</span>
                    <span>解题 {day.solved} 道</span>
                    <small>活跃分 {score}</small>
                </>
            ) : (
                <span>当天没有做题记录</span>
            )}
        </div>
    );
}

export default function ProfilePage() {
    const {user, updateUser} = useAuth();
    const [passwordForm] = Form.useForm<PasswordFormValues>();

    const avatarInputRef = useRef<HTMLInputElement>(null);
    const coverInputRef = useRef<HTMLInputElement>(null);
    // @ts-ignore
    const nicknameInputRef = useRef<Input>(null);

    const [stats, setStats] = useState<ProfileStats>();
    const [activity, setActivity] = useState<ActivityDay[]>([]);
    const [nicknameDraft, setNicknameDraft] = useState("");
    const [editingNickname, setEditingNickname] = useState(false);
    const [loading, setLoading] = useState(true);
    const [passwordOpen, setPasswordOpen] = useState(false);
    const [savingNickname, setSavingNickname] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);
    const [uploadingAvatar, setUploadingAvatar] = useState(false);
    const [uploadingCover, setUploadingCover] = useState(false);

    async function loadProfile() {
        setLoading(true);

        try {
            const [profileData, activityData] = await Promise.all([
                request<ProfileResponse>("/users/me/profile"),
                request<ActivityResponse>("/users/me/activity?days=365")
            ]);

            updateUser(profileData.user);
            setStats(profileData.stats);
            setActivity(activityData.items);
            setNicknameDraft(profileData.user.nickname || "");
        } catch (error) {
            message.error((error as Error).message);
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        loadProfile();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (editingNickname) {
            window.setTimeout(() => nicknameInputRef.current?.focus(), 0);
        }
    }, [editingNickname]);

    function startNicknameEdit() {
        setNicknameDraft(user?.nickname || "");
        setEditingNickname(true);
    }

    function cancelNicknameEdit() {
        setNicknameDraft(user?.nickname || "");
        setEditingNickname(false);
    }

    async function saveNickname() {
        const nickname = nicknameDraft.trim();

        if (nickname.length > 32) {
            message.warning("昵称最多 32 个字符");
            return;
        }

        setSavingNickname(true);

        try {
            const data = await request<{ user: User }>("/users/me/profile", {
                method: "PUT",
                body: JSON.stringify({nickname})
            });

            updateUser(data.user);
            setNicknameDraft(data.user.nickname || "");
            setEditingNickname(false);
            message.success("昵称已保存");
        } catch (error) {
            message.error((error as Error).message);
        } finally {
            setSavingNickname(false);
        }
    }

    async function changePassword(values: PasswordFormValues) {
        setChangingPassword(true);

        try {
            await request<void>("/users/me/password", {
                method: "PUT",
                body: JSON.stringify({
                    old_password: values.old_password,
                    new_password: values.new_password
                })
            });

            passwordForm.resetFields();
            setPasswordOpen(false);
            message.success("密码已修改");
        } catch (error) {
            message.error((error as Error).message);
        } finally {
            setChangingPassword(false);
        }
    }

    async function uploadImage(kind: "avatar" | "cover", file?: File) {
        if (!file) return;

        if (!file.type.startsWith("image/")) {
            message.warning("请选择图片文件");
            return;
        }

        if (file.size > 3 * 1024 * 1024) {
            message.warning("图片不能超过 3MB");
            return;
        }

        const form = new FormData();
        form.append("file", file);

        const setUploading = kind === "avatar" ? setUploadingAvatar : setUploadingCover;
        setUploading(true);

        try {
            const data = await request<{ user: User }>(`/users/me/${kind}`, {
                method: "POST",
                body: form
            });

            updateUser(data.user);
            message.success(kind === "avatar" ? "头像已更新" : "主页背景已更新");
        } catch (error) {
            message.error((error as Error).message);
        } finally {
            setUploading(false);
        }
    }

    function onImageInputChange(kind: "avatar" | "cover", event: ChangeEvent<HTMLInputElement>) {
        const file = event.target.files?.[0];
        event.target.value = "";
        uploadImage(kind, file);
    }

    const displayName = user?.nickname || user?.username || "用户";
    const avatar = assetURL(user?.avatar_url);
    const cover = assetURL(user?.cover_url);

    const totalSubmissions = stats?.total_submissions ?? 0;
    const acceptedSubmissions = stats?.accepted_submissions ?? 0;
    const solvedProblems = stats?.solved_problems ?? 0;
    const activeDays = stats?.active_days ?? 0;
    const passRate = totalSubmissions > 0 ? (acceptedSubmissions / totalSubmissions) * 100 : 0;

    const {cells, weekCount, monthMarkers} = useMemo(() => buildHeatmapCells(activity), [activity]);
    const streak = useMemo(() => currentStreak(activity), [activity]);
    const recent30Active = useMemo(() => recentActiveDays(activity, 30), [activity]);

    return (
        <div className="profile-page">
            <input
                ref={avatarInputRef}
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => onImageInputChange("avatar", event)}
            />
            <input
                ref={coverInputRef}
                hidden
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onChange={(event) => onImageInputChange("cover", event)}
            />

            <section
                className={cover ? "profile-cover has-cover" : "profile-cover"}
                style={cover ? {backgroundImage: `url(${cover})`} : undefined}
            >
                <div className="profile-cover-shade"/>

                <Button
                    className="profile-cover-upload"
                    icon={<PictureOutlined/>}
                    loading={uploadingCover}
                    onClick={() => coverInputRef.current?.click()}
                >
                    {cover ? "更换主页背景" : "上传主页背景"}
                </Button>

                <div className="profile-cover-content">
                    <button
                        type="button"
                        className="profile-avatar-button"
                        onClick={() => avatarInputRef.current?.click()}
                        disabled={uploadingAvatar}
                    >
                        <Avatar size={96} src={avatar} icon={<UserOutlined/>}/>
                        <span>
              <CameraOutlined/>
                            {uploadingAvatar ? "上传中" : "更换头像"}
            </span>
                    </button>

                    <div className="profile-cover-main">
                        {editingNickname ? (
                            <div className="profile-nickname-editor">
                                <Input
                                    ref={nicknameInputRef}
                                    value={nicknameDraft}
                                    maxLength={32}
                                    size="large"
                                    placeholder="设置展示昵称"
                                    onChange={(event) => setNicknameDraft(event.target.value)}
                                    onPressEnter={saveNickname}
                                />

                                <Button
                                    type="primary"
                                    icon={<SaveOutlined/>}
                                    loading={savingNickname}
                                    onClick={saveNickname}
                                >
                                    保存
                                </Button>

                                <Button icon={<CloseOutlined/>} onClick={cancelNicknameEdit}>
                                    取消
                                </Button>
                            </div>
                        ) : (
                            <Tooltip title="双击修改昵称">
                                <Typography.Title
                                    level={1}
                                    className="profile-display-name"
                                    onDoubleClick={startNicknameEdit}
                                >
                                    {displayName}
                                </Typography.Title>
                            </Tooltip>
                        )}

                        <Space wrap size={[8, 8]}>
                            <Tag>昵称 @ {user?.username}</Tag>
                            <Tag color={user?.role === "admin" ? "purple" : "blue"}>角色: {user?.role}</Tag>
                        </Space>
                    </div>

                    <Button
                        className="profile-cover-password"
                        icon={<LockOutlined/>}
                        onClick={() => setPasswordOpen(true)}
                    >
                        修改密码
                    </Button>
                </div>
            </section>

            <Row gutter={[14, 14]}>
                <Col xs={12} md={6}>
                    <Card className="profile-metric-card" loading={loading}>
                        <Statistic title="总提交" value={totalSubmissions}/>
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card className="profile-metric-card is-success" loading={loading}>
                        <Statistic title="通过提交" value={acceptedSubmissions} prefix={<CheckCircleOutlined/>}/>
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card className="profile-metric-card is-primary" loading={loading}>
                        <Statistic title="已解题目" value={solvedProblems} prefix={<FireOutlined/>}/>
                    </Card>
                </Col>
                <Col xs={12} md={6}>
                    <Card className="profile-metric-card is-warning" loading={loading}>
                        <Statistic title="连续活跃" value={streak} suffix="天"/>
                    </Card>
                </Col>
            </Row>

            <Card
                className="profile-card profile-activity-card"
                loading={loading}
                title="做题热力图"
                extra={<Typography.Text type="secondary">最近 365 天</Typography.Text>}
            >
                <div className="profile-activity-summary">
                    <div>
                        <Typography.Text type="secondary">通过率</Typography.Text>
                        <strong>{formatPercent(passRate)}</strong>
                    </div>
                    <div>
                        <Typography.Text type="secondary">最近 30 天活跃</Typography.Text>
                        <strong>{recent30Active} 天</strong>
                    </div>
                    <div>
                        <Typography.Text type="secondary">全年活跃</Typography.Text>
                        <strong>{activeDays} 天</strong>
                    </div>
                </div>

                <div className="profile-heatmap-fit">
                    <div
                        className="profile-heatmap-months"
                        style={{gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))`}}
                    >
                        {monthMarkers.map((marker) => (
                            <span key={`${marker.week}-${marker.label}`} style={{gridColumnStart: marker.week + 1}}>
                {marker.label}
              </span>
                        ))}
                    </div>

                    <div className="profile-heatmap-body">
                        <div className="profile-heatmap-weekdays">
                            <span>日</span>
                            <span/>
                            <span>二</span>
                            <span/>
                            <span>四</span>
                            <span/>
                            <span>六</span>
                        </div>

                        <div
                            className="profile-heatmap"
                            style={{gridTemplateColumns: `repeat(${weekCount}, minmax(0, 1fr))`}}
                        >
                            {cells.map((cell) => {
                                if (cell.blank || !cell.day) {
                                    return <span key={cell.key} className="heatmap-cell is-empty"/>;
                                }

                                return (
                                    <Tooltip
                                        key={cell.key}
                                        placement="top"
                                        mouseEnterDelay={0.08}
                                        overlayClassName="profile-heatmap-tooltip"
                                        title={<HeatmapTooltipContent day={cell.day} score={cell.score ?? 0}/>}
                                    >
                    <span
                        className={`heatmap-cell level-${cell.level}`}
                        aria-label={`${cell.day.date}，提交 ${cell.day.submissions} 次，通过 ${cell.day.accepted_submissions} 次，解题 ${cell.day.solved} 道`}
                    />
                                    </Tooltip>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="profile-heatmap-footer">
                    <Typography.Text type="secondary">颜色按这一年内的活跃分位动态计算。</Typography.Text>

                    <div className="profile-heatmap-legend">
                        <span>少</span>
                        {[0, 1, 2, 3, 4].map((level) => (
                            <i key={level} className={`heatmap-cell level-${level}`}/>
                        ))}
                        <span>多</span>
                    </div>
                </div>
            </Card>

            <Drawer
                title="修改密码"
                open={passwordOpen}
                width={420}
                onClose={() => setPasswordOpen(false)}
                destroyOnClose
            >
                <Form form={passwordForm} layout="vertical" onFinish={changePassword}>
                    <Form.Item
                        label="当前密码"
                        name="old_password"
                        rules={[{required: true, message: "请输入当前密码"}]}
                    >
                        <Input.Password placeholder="当前密码"/>
                    </Form.Item>

                    <Form.Item
                        label="新密码"
                        name="new_password"
                        rules={[
                            {required: true, message: "请输入新密码"},
                            {min: 6, message: "密码至少 6 位"},
                            {max: 72, message: "密码最多 72 位"}
                        ]}
                    >
                        <Input.Password placeholder="新密码"/>
                    </Form.Item>

                    <Form.Item
                        label="确认新密码"
                        name="confirm_password"
                        dependencies={["new_password"]}
                        rules={[
                            {required: true, message: "请再次输入新密码"},
                            ({getFieldValue}) => ({
                                validator(_, value) {
                                    if (!value || getFieldValue("new_password") === value) {
                                        return Promise.resolve();
                                    }

                                    return Promise.reject(new Error("两次输入的新密码不一致"));
                                }
                            })
                        ]}
                    >
                        <Input.Password placeholder="再次输入新密码"/>
                    </Form.Item>

                    <Button htmlType="submit" icon={<LockOutlined/>} loading={changingPassword} block>
                        修改密码
                    </Button>
                </Form>
            </Drawer>
        </div>
    );
}
