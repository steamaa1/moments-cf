package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"

	fs_util "github.com/kingwrcy/moments/util"

	"github.com/kingwrcy/moments/db"
	"github.com/kingwrcy/moments/handler"
	"github.com/kingwrcy/moments/vo"
	"github.com/rs/zerolog"
	"github.com/tidwall/gjson"
	"gorm.io/gorm"
)

func migrateTo3(tx *gorm.DB, log zerolog.Logger) {
	var (
		count int64
		admin db.User
		item  vo.FullSysConfigVO
	)
	tx.Table("SysConfig").Count(&count)
	if count == 0 {
		log.Info().Msg("初始化默认配置...")
		if err := tx.First(&admin).Error; errors.Is(err, gorm.ErrRecordNotFound) {
			admin.Username = "admin"
			admin.Password = "$2a$12$Ruw0XIDW3IuHmD3WXsRTnOUt/0sfqgKWP3wbsqx5sGcCuebWa6X.i"
			admin.Title = "极简朋友圈"
			admin.Slogan = "修道者，逆天而行，注定要一生孤独。"
			admin.Nickname = "admin"
			admin.EnableS3 = "0"
			admin.Favicon = "/favicon.png"
			admin.CoverUrl = "/cover.webp"
			admin.AvatarUrl = "/avatar.webp"
			if err := tx.Save(&admin).Error; err != nil {
				log.Info().Msgf("用户不存在,初始化[admin/a123456]用户... 失败:%s", err)
			} else {
				log.Info().Msg("用户不存在,初始化[admin/a123456]用户... 成功!")
			}
		}
		item.AdminUserName = admin.Username
		item.Css = admin.Css
		item.Js = admin.Js
		item.BeiAnNo = admin.BeianNo
		item.Favicon = admin.Favicon
		item.Title = admin.Title
		if admin.EnableS3 == "0" {
			item.EnableS3 = false
		} else {
			item.EnableS3 = true
			item.S3 = vo.S3VO{
				Domain:          admin.Domain,
				Bucket:          admin.Bucket,
				Region:          admin.Region,
				AccessKey:       admin.AccessKey,
				SecretKey:       admin.SecretKey,
				Endpoint:        admin.Endpoint,
				ThumbnailSuffix: admin.ThumbnailSuffix,
			}
		}
		item.EnableGoogleRecaptcha = false
		item.EnableComment = true
		item.MaxCommentLength = 120
		item.MaxCommentLength = 300
		item.CommentOrder = "desc"
		item.TimeFormat = "timeAgo"
		var sysConfig db.SysConfig

		content, err := json.Marshal(&item)
		if err != nil {
			log.Error().Msgf("初始化默认配置执行异常:%s", err)
		}
		sysConfig.Content = string(content)
		if err := tx.Save(&sysConfig).Error; err == nil {
			log.Info().Msg("初始化默认配置执行成功")
		}

		var memos []db.Memo
		tx.Find(&memos)
		for _, memo := range memos {
			log.Info().Msgf("开始迁移memo id:%d", memo.Id)
			var extMap = map[string]any{}
			var ext vo.MemoExt
			err := json.Unmarshal([]byte(memo.Ext), &extMap)
			if err != nil {
				log.Warn().Msgf("memo id:%d ext属性不是标准的json格式 => %s,忽略..", memo.Id, memo.Ext)
				continue
			}
			if value, exist := extMap["videoUrl"]; exist && value != "" {
				ext.Video.Type = "online"
				ext.Video.Value = value.(string)
			}
			if value, exist := extMap["localVideoUrl"]; exist && value != "" {
				ext.Video.Type = "online"
				ext.Video.Value = value.(string)
			}
			if value, exist := extMap["youtubeUrl"]; exist && value != "" {
				ext.Video.Type = "youtube"
				ext.Video.Value = value.(string)
			}
			if memo.BilibiliUrl != "" {
				ext.Video.Type = "bilibili"
				ext.Video.Value = fmt.Sprintf("<iframe src=\"%s\" scrolling=\"no\" border=\"0\" frameborder=\"no\" framespacing=\"0\" allowfullscreen=\"true\"></iframe>", memo.BilibiliUrl)
			}
			if value, exist := extMap["doubanBook"]; exist && value != nil {
				val := gjson.Get(memo.Ext, "doubanBook")
				ext.DoubanBook.Title = val.Get("title").Str
				ext.DoubanBook.Desc = val.Get("desc").Str
				ext.DoubanBook.Image = val.Get("image").Str
				ext.DoubanBook.Author = val.Get("author").Str
				ext.DoubanBook.Isbn = val.Get("isbn").Str
				ext.DoubanBook.Url = val.Get("url").Str
				ext.DoubanBook.Rating = val.Get("rating").Str
				ext.DoubanBook.PubDate = val.Get("pubDate").Str
				ext.DoubanBook.Id = val.Get("id").Str
			}
			if value, exist := extMap["doubanMovie"]; exist && value != nil {
				val := gjson.Get(memo.Ext, "doubanMovie")
				ext.DoubanMovie.Title = val.Get("title").Str
				ext.DoubanMovie.Desc = val.Get("desc").Str
				ext.DoubanMovie.Image = val.Get("image").Str
				ext.DoubanMovie.Director = val.Get("director").Str
				ext.DoubanMovie.ReleaseDate = val.Get("releaseDate").Str
				ext.DoubanMovie.Url = val.Get("url").Str
				ext.DoubanMovie.Rating = val.Get("rating").Str
				ext.DoubanMovie.Actors = val.Get("actors").Str
				ext.DoubanMovie.Id = val.Get("id").Str
			}

			extContent, _ := json.Marshal(ext)
			memo.Ext = string(extContent)
			newTags := ""

			memoContent, tags := handler.FindAndReplaceTags(memo.Content)
			if len(tags) > 0 {
				memo.Content = memoContent
				newTags = strings.Join(tags, ",")
				if newTags != "" {
					newTags = newTags + ","
				}
				memo.Tags = &newTags
			}

			if err = tx.Save(&memo).Error; err != nil {
				log.Info().Msgf("迁移memo id:%d 成功", memo.Id)
			}

		}
	}

	// 修复之前版本的时间格式问题
	tx.Exec(`UPDATE memo
SET 
    createdAt = datetime(createdAt / 1000, 'unixepoch'),
    updatedAt = datetime(updatedAt / 1000, 'unixepoch')
WHERE 
    ((createdAt NOT LIKE '%-%' AND length(createdAt) = 13) OR 
    (updatedAt NOT LIKE '%-%' AND length(updatedAt) = 13))`)

	tx.Exec(`UPDATE comment
SET 
    createdAt = datetime(createdAt / 1000, 'unixepoch'),
    updatedAt = datetime(updatedAt / 1000, 'unixepoch')
WHERE 
    ((createdAt NOT LIKE '%-%' AND length(createdAt) = 13) OR 
    (updatedAt NOT LIKE '%-%' AND length(updatedAt) = 13))`)

	tx.Exec(`UPDATE user
SET 
    createdAt = datetime(createdAt / 1000, 'unixepoch'),
    updatedAt = datetime(updatedAt / 1000, 'unixepoch')
WHERE 
    ((createdAt NOT LIKE '%-%' AND length(createdAt) = 13) OR 
    (updatedAt NOT LIKE '%-%' AND length(updatedAt) = 13))`)
}

func migrateIframeVideoUrl(tx *gorm.DB, log zerolog.Logger) {
	var memos []db.Memo
	tx.Find(&memos)

	bilibiliUrlReg := regexp.MustCompile(`src=['"](?:https?:)?(?:\/)*([^'"]+)['"]`)
	youtubeUrlRegList := []*regexp.Regexp{
		regexp.MustCompile(`v=([^&#]+)`),
		regexp.MustCompile(`youtu\.be\/([^\/\?]+)`),
	}

	for _, memo := range memos {
		var ext vo.MemoExt
		err := json.Unmarshal([]byte(memo.Ext), &ext)
		if err != nil {
			log.Warn().Msgf("memo id: %d 的 ext 不是标准的 json 格式 => %s", memo.Id, memo.Ext)
			continue
		}

		// 测试数据开始
		// if ext.Video.Value != "" {
		// 	ext.Video.Type = "bilibili"
		// 	ext.Video.Value = `<iframe src="//player.bilibili.com/player.html?isOutside=true&aid=123&bvid=FDA1FAD&cid=123&p=1" scrolling></iframe>`
		// 	ext.Video.Value = `//player.bilibili.com/player.html?isOutside=true&aid=123&bvid=FDA1FAD&cid=123&p=1`
		// 	ext.Video.Value = `https://player.bilibili.com/player.html?isOutside=true&aid=123&bvid=FDA1FAD&cid=123&p=1`
		// }

		// if ext.Video.Value != "" {
		// 	ext.Video.Type = "youtube"
		// 	ext.Video.Value = "https://www.youtube.com/watch?v=hacdT_G2Ara&q=123"
		// 	ext.Video.Value = "https://youtu.be/hacdT_G2Ara?si=aa_a_a_aaa"
		// 	ext.Video.Value = "https://youtu.be/hacdT_G2Ara"
		// 	ext.Video.Value = "//www.youtube.com/embed/hacdT_G2Ara"
		// 	ext.Video.Value = "https://www.youtube.com/embed/hacdT_G2Ara"
		// }
		// 测试数据结束

		if ext.Video.Value == "" ||
			strings.HasPrefix(ext.Video.Value, "https://player.bilibili.com/player.html") ||
			strings.HasPrefix(ext.Video.Value, "https://www.youtube.com/embed") {
			continue
		}

		log.Info().Msgf("开始迁移 memo id: %d 的 %s url: %s", memo.Id, ext.Video.Type, ext.Video.Value)

		if strings.HasPrefix(ext.Video.Value, "//") {
			ext.Video.Value = fmt.Sprintf("https:%s", ext.Video.Value)
		} else if strings.HasPrefix(ext.Video.Value, "http://") {
			ext.Video.Value = strings.Replace(ext.Video.Value, "http://", "https://", 1)
		} else if ext.Video.Type == "bilibili" {
			matchResult := bilibiliUrlReg.FindStringSubmatch(ext.Video.Value)
			if matchResult == nil {
				continue
			}

			ext.Video.Value = fmt.Sprintf(`https://%s`, matchResult[1])
		} else if ext.Video.Type == "youtube" {
			for _, youtubeUrlReg := range youtubeUrlRegList {
				matchResult := youtubeUrlReg.FindStringSubmatch(ext.Video.Value)
				if matchResult == nil {
					continue
				}

				ext.Video.Value = fmt.Sprintf(
					`https://www.youtube.com/embed/%s`,
					matchResult[1],
				)
				break
			}
		} else {
			log.Info().Msgf("视频地址无需迁移")
			continue
		}

		log.Info().Msgf("迁移后的 url: %s", ext.Video.Value)
		extContent, _ := json.Marshal(ext)
		memo.Ext = string(extContent)
		if err = tx.Save(&memo).Error; err == nil {
			log.Info().Msgf("迁移 memo id: %d 成功", memo.Id)
		} else {
			log.Error().Msgf("迁移 memo id: %d 失败, 原因：%v", memo.Id, err)
		}
	}
}

// migrageFile 迁移文件数据
func migrageFile(tx *gorm.DB, log zerolog.Logger, uploadDir string) {
	// 检查文件信息表是否已有数据
	var count int64
	err := tx.Model(&db.File{}).Count(&count).Error
	if err != nil {
		log.Error().Msgf("查询文件信息表异常: %v", err)
		return
	}

	// 如果文件信息表已存在数据, 则跳过迁移
	if count != 0 {
		return
	}

	// 查询所有包含图片和视频的 memo 记录
	var memos []db.Memo
	if err := tx.Model(&db.Memo{}).Where("(imgs is not null and imgs != '') or (json_extract(ext, '$.video.value') like '/upload/%')").Find(&memos).Error; err != nil {
		log.Error().Msgf("查询 memo 表异常: %v", err)
		return
	}

	if len(memos) == 0 {
		log.Debug().Msg("memo 表中没有需要迁移的文件")
		return
	}

	// 遍历每个 memo 处理其中的文件
	isFileRecorded := make(map[string]bool)
	for _, memo := range memos {
		var memoExt vo.MemoExt
		err := json.Unmarshal([]byte(memo.Ext), &memoExt)
		if err != nil {
			log.Error().Msgf("memo id: %d 的 ext 不是标准的 json 格式 => %s", memo.Id, memo.Ext)
			continue
		}

		filePaths := []string{}
		filePaths = append(filePaths, memoExt.Video.Value)
		filePaths = append(filePaths, strings.Split(memo.Imgs, ",")...)

		for _, filePath := range filePaths {
			// 只处理上传到本地的文件
			if !strings.HasPrefix(filePath, "/upload/") {
				continue
			}

			// 创建文件记录
			var file db.File
			err = tx.Model(&db.File{}).FirstOrCreate(&file, db.File{Path: filePath}).Error
			if err != nil {
				log.Error().Msgf("创建文件 %s 信息错误: %v", filePath, err)
				continue
			}

			// 文件已记录
			isFileRecorded[file.Path] = true

			// 记录文件与 memo 的关联关系
			fileRel := db.FileRel{
				RelId:   memo.Id,
				RelType: db.RelTypeMemo,
				FileId:  file.Id,
			}
			if err := tx.Model(&db.FileRel{}).Create(&fileRel).Error; err != nil {
				log.Error().Msgf("创建文件 %s 与 memo %d 的关系错误: %v", filePath, memo.Id, err)
			}
		}
	}

	// 处理系统配置
	var sysConfig db.SysConfig
	var result vo.FullSysConfigVO
	err = tx.First(&sysConfig).Error
	if err != nil {
		log.Error().Msgf("查询系统配置异常: %v", err)
		return
	}
	if err := json.Unmarshal([]byte(sysConfig.Content), &result); err != nil {
		log.Error().Msgf("读取系统配置异常: %v", err)
		return
	}
	filePath := result.Favicon
	// 只处理上传到本地的文件
	if strings.HasPrefix(filePath, "/upload/") {
		// 创建文件记录
		var file db.File
		err = tx.Model(&db.File{}).FirstOrCreate(&file, db.File{Path: filePath}).Error
		if err != nil {
			log.Error().Msgf("创建文件 %s 信息错误: %v", filePath, err)
		} else {
			// 文件已记录
			isFileRecorded[file.Path] = true

			// 记录文件与 系统配置 的关联关系
			fileRel := db.FileRel{
				RelId:   0,
				RelType: db.RelTypeFavicon,
				FileId:  file.Id,
			}
			if err := tx.Model(&db.FileRel{}).Create(&fileRel).Error; err != nil {
				log.Error().Msgf("创建文件 %s 与 系统配置 的关系错误: %v", filePath, err)
			}
		}
	}

	// 处理用户信息
	var users []db.User
	tx.Find(&users)
	for _, user := range users {
		filePath := user.AvatarUrl
		// 只处理上传到本地的文件
		if strings.HasPrefix(filePath, "/upload/") {
			// 创建文件记录
			var file db.File
			err = tx.Model(&db.File{}).FirstOrCreate(&file, db.File{Path: filePath}).Error
			if err != nil {
				log.Error().Msgf("创建文件 %s 信息错误: %v", filePath, err)
			} else {
				// 文件已记录
				isFileRecorded[file.Path] = true

				// 记录文件与 用户 的关联关系
				fileRel := db.FileRel{
					RelId:   user.Id,
					RelType: db.RelTypeUserAvatar,
					FileId:  file.Id,
				}
				if err := tx.Model(&db.FileRel{}).Create(&fileRel).Error; err != nil {
					log.Error().Msgf("创建文件 %s 与 用户 %d 的关系错误: %v", filePath, user.Id, err)
				}
			}
		}

		filePath = user.CoverUrl
		// 只处理上传到本地的文件
		if strings.HasPrefix(filePath, "/upload/") {
			// 创建文件记录
			var file db.File
			err = tx.Model(&db.File{}).FirstOrCreate(&file, db.File{Path: filePath}).Error
			if err != nil {
				log.Error().Msgf("创建文件 %s 信息错误: %v", filePath, err)
			} else {
				// 文件已记录
				isFileRecorded[file.Path] = true

				// 记录文件与 用户 的关联关系
				fileRel := db.FileRel{
					RelId:   user.Id,
					RelType: db.RelTypeUserCover,
					FileId:  file.Id,
				}
				if err := tx.Model(&db.FileRel{}).Create(&fileRel).Error; err != nil {
					log.Error().Msgf("创建文件 %s 与 用户 %d 的关系错误: %v", filePath, user.Id, err)
				}
			}
		}
	}

	// 处理未被引用的文件
	fileList, err := fs_util.GetFileList(uploadDir)
	if err != nil {
		log.Error().Msgf("获取文件列表错误: %v", err)
		return
	}
	for _, filename := range fileList {
		filePath := filepath.Join("/upload", filename)
		fmt.Println("filePath", filePath)
		if _, ok := isFileRecorded[filePath]; !ok {
			// 创建文件记录
			var file db.File
			err = tx.Model(&db.File{}).FirstOrCreate(&file, db.File{Path: filePath}).Error
			if err != nil {
				log.Error().Msgf("创建文件 %s 信息错误: %v", filePath, err)
				return
			}
		}
	}

	log.Debug().Msg("文件数据迁移完成")
}
