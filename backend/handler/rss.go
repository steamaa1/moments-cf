package handler

import (
	"encoding/json"
	"net/http"

	"github.com/kingwrcy/moments/db"
	"github.com/kingwrcy/moments/pkg"
	"github.com/kingwrcy/moments/vo"
	"github.com/labstack/echo/v4"
	"github.com/samber/do/v2"
	"gorm.io/gorm"
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

	feed := pkg.GenerateRss(memos, &sysConfigVO, &user, host)

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
