package pkg

import (
	"fmt"
	"time"

	"github.com/gomarkdown/markdown"
	"github.com/gomarkdown/markdown/parser"
	"github.com/gorilla/feeds"
	"github.com/kingwrcy/moments/db"
	"github.com/kingwrcy/moments/vo"
	"github.com/microcosm-cc/bluemonday"
)

func GenerateRss(memos []db.Memo, sysConfigVO *vo.FullSysConfigVO, user *db.User, host string) *feeds.Feed {
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
			Description: ParseMarkdownToHtml(memo.Content),
			Author:      &feeds.Author{Name: memo.User.Nickname},
			Created:     *memo.CreatedAt,
			Updated:     *memo.UpdatedAt,
		})
	}
	return feed
}

func ParseMarkdownToHtml(md string) string {
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
