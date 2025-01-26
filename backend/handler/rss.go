package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/kingwrcy/moments/db"
	"github.com/kingwrcy/moments/vo"
	"github.com/labstack/echo/v4"
	"github.com/samber/do/v2"
	"gorm.io/gorm"

	"github.com/gomarkdown/markdown"
	"github.com/gomarkdown/markdown/parser"
	"github.com/gorilla/feeds"
	"github.com/microcosm-cc/bluemonday"
)

type RssHandler struct {
	base BaseHandler
	hc   http.Client
}

func NewRssHandler(injector do.Injector) *RssHandler {
	return &RssHandler{
		base: do.MustInvoke[BaseHandler](injector),
		hc:   http.Client{},
	}
}

func (r RssHandler) GetRss(c echo.Context) error {
	rss, err := r.generateRss(c.Request().Host)
	if err != nil {
		return FailRespWithMsg(c, Fail, "RSS生成失败")
	}
	return c.String(http.StatusOK, rss)
}

func (r RssHandler) generateRss(host string) (string, error) {
	var (
		memos       []db.Memo
		user        db.User
		sysConfig   db.SysConfig
		sysConfigVO vo.FullSysConfigVO
	)

	// 获取系统设置
	r.base.db.First(&sysConfig)
	_ = json.Unmarshal([]byte(sysConfig.Content), &sysConfigVO)

	// 获取管理员信息
	r.base.db.First(&user, "Username = ?", "admin")

	// 使用自定义RSS
	if sysConfigVO.Rss != "" {
		return "", nil
	}

	// 查询动态
	tx := r.base.db.Preload("User", func(x *gorm.DB) *gorm.DB {
		return x.Select("username", "nickname", "id")
	}).Where("pinned = 0")
	tx.Order("createdAt desc").Limit(10).Find(&memos)

	feed := generateFeed(memos, &sysConfigVO, &user, host)

	return feed.ToRss()

	// // 将RSS内容写入/rss/default_rss.xml
	// target := "/rss/default_rss.xml"
	// dir := filepath.Dir(target)
	// if err := os.MkdirAll(dir, os.ModePerm); err != nil {
	// 	return "", fmt.Errorf("创建目录失败: %w", err)
	// }
	// if err := os.WriteFile(target, []byte(rss), 0644); err != nil {
	// 	return "", fmt.Errorf("写入RSS失败: %w", err)
	// }
}

func generateFeed(memos []db.Memo, sysConfigVO *vo.FullSysConfigVO, user *db.User, host string) *feeds.Feed {
	now := time.Now()
	feed := &feeds.Feed{
		Title:       sysConfigVO.Title,
		Link:        &feeds.Link{Href: fmt.Sprintf("%s/rss/default_rss.xml", host)},
		Description: user.Slogan,
		Author:      &feeds.Author{Name: user.Nickname},
		Created:     now,
	}

	feed.Items = []*feeds.Item{}
	for _, memo := range memos {
		feed.Items = append(feed.Items, &feeds.Item{
			Title:       fmt.Sprintf("Memo #%d", memo.Id),
			Link:        &feeds.Link{Href: fmt.Sprintf("%s/memo/%d", host, memo.Id)},
			Description: parseMarkdownToHtml(memo.Content),
			Author:      &feeds.Author{Name: memo.User.Nickname},
			Created:     *memo.CreatedAt,
			Updated:     *memo.UpdatedAt,
		})
	}
	return feed
}

func parseMarkdownToHtml(md string) string {
	// 启用扩展
	extensions := parser.NoIntraEmphasis | // 忽略单词内部的强调标记
		parser.Tables | // 解析表格语法
		parser.FencedCode | // 解析围栏代码块
		parser.Strikethrough | // 支持删除线语法
		parser.HardLineBreak | // 将换行符（\n）转换为 <br> 标签
		parser.Footnotes | // 支持脚注语法
		parser.MathJax | // 支持 MathJax 数学公式语法
		parser.SuperSubscript | // 支持上标和下标语法
		parser.EmptyLinesBreakList // 允许两个空行中断列表
	p := parser.NewWithExtensions(extensions)

	// 将 Markdown 解析为 HTML
	html := markdown.ToHTML([]byte(md), p, nil)

	// 清理 HTML（防止 XSS 攻击）
	cleanHTML := bluemonday.UGCPolicy().SanitizeBytes(html)

	return string(cleanHTML)
}
