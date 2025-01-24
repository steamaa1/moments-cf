package pkg

import (
	"fmt"
	"time"

	"github.com/gorilla/feeds"
	"github.com/kingwrcy/moments/db"
	"github.com/kingwrcy/moments/vo"
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
			Description: memo.Content,
			Author:      &feeds.Author{Name: memo.User.Nickname},
			Created:     *memo.CreatedAt,
			Updated:     *memo.UpdatedAt,
		})
	}
	return feed
}
