package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	fs_util "github.com/kingwrcy/moments/util"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/duke-git/lancet/v2/slice"
	"github.com/google/uuid"
	"github.com/kingwrcy/moments/db"
	"github.com/kingwrcy/moments/vo"
	"github.com/labstack/echo/v4"
	"github.com/samber/do/v2"
	"gorm.io/gorm"
)

type FileHandler struct {
	base BaseHandler
}

func NewFileHandler(injector do.Injector) *FileHandler {
	return &FileHandler{do.MustInvoke[BaseHandler](injector)}
}

// Upload godoc
//
//	@Tags		File
//	@Summary	上传文件
//	@Accept		json
//	@Produce	json
//	@Param		x-api-token	header	string	true	"登录TOKEN"
//	@Success	200
//	@Router		/api/file/upload [post]
func (f FileHandler) Upload(c echo.Context) error {
	var (
		result      []string
		fileRecords []db.File
	)

	form, err := c.MultipartForm()
	if err != nil {
		f.base.log.Error().Msgf("读取上传文件异常: %v", err)
		return FailRespWithMsg(c, Fail, "上传文件异常")
	}

	if err := os.MkdirAll(f.base.cfg.UploadDir, 0755); err != nil {
		f.base.log.Error().Msgf("创建父级目录异常: %v", err)
		return FailRespWithMsg(c, Fail, "上传文件异常")
	}

	files := form.File["files"]
	for _, file := range files {
		// 原始文件数据
		reader, err := file.Open()
		if err != nil {
			f.base.log.Error().Msgf("打开上传文件异常: %v", err)
			return FailRespWithMsg(c, Fail, "上传文件异常")
		}
		defer reader.Close()

		// 计算文件 hash
		sha256, err := fs_util.Sha256(reader)
		if err != nil {
			f.base.log.Error().Msgf("计算文件 hash 异常: %v", err)
			return FailRespWithMsg(c, Fail, "上传文件异常")
		}

		// 计算文件后缀
		ext := filepath.Ext(file.Filename)

		// 计算文件本地路径
		filename := fmt.Sprintf("%s%s", sha256, ext)
		filePath := path.Join(f.base.cfg.UploadDir, filename)

		// 添加到结果中
		result = append(result, "/upload/"+filename)

		// 如果文件存在，则跳过保存操作
		if fs_util.Exists(filePath) {
			continue
		}

		// 创建原始文件
		dst, err := os.Create(filePath)
		if err != nil {
			f.base.log.Error().Msgf("打开目标文件异常: %v", err)
			return FailRespWithMsg(c, Fail, "上传文件异常")
		}
		defer dst.Close()

		// 重置文件指针到开头
		if seeker, ok := reader.(io.Seeker); ok {
			if _, err := seeker.Seek(0, io.SeekStart); err != nil {
				f.base.log.Error().Msgf("重置文件指针异常: %v", err)
				return FailRespWithMsg(c, Fail, "上传文件异常")
			}
		}

		// 保存文件数据
		if _, err = io.Copy(dst, reader); err != nil {
			f.base.log.Error().Msgf("复制文件异常: %v", err)
			return FailRespWithMsg(c, Fail, "上传文件异常")
		}

		// 生成并保存缩略图文件
		if SupportCompress(filename) {
			thumb_filename := fmt.Sprintf("%s_thumb%s", sha256, ext)
			thumb_filepath := path.Join(f.base.cfg.UploadDir, thumb_filename)
			if err := CompressImage(f, filePath, thumb_filepath, 30); err != nil {
				f.base.log.Error().Msgf("压缩文件异常: %v", err)
			}
		}

		// 暂存图片信息
		fileRecords = append(fileRecords, db.File{
			Path: "/upload/" + filename,
		})
	}

	if err := f.base.db.CreateInBatches(fileRecords, 20).Error; err != nil {
		f.base.log.Error().Msgf("保存文件信息异常: %v", err)
		// 删除已保存的文件
		for _, file := range fileRecords {
			os.Remove(file.Path)
		}

		return FailRespWithMsg(c, Fail, "上传文件异常")
	}

	return SuccessResp(c, result)
}

func (f FileHandler) Exist(c echo.Context) error {
	filename := c.QueryParam("filename")
	if strings.Contains(filename, "..") || strings.HasPrefix(filename, "/") {
		return FailRespWithMsg(c, Fail, "文件名包含非法字符")
	}

	filePath := filepath.Join(f.base.cfg.UploadDir, filename)
	return SuccessResp(c, h{
		"exist": fs_util.Exists(filePath),
		"path":  "/upload/" + filename,
	})
}

// Clean godoc
//
//	@Tags		File
//	@Summary	将没有关联的文件移动到 {uploadDir}/removed 目录下
//	@Accept		json
//	@Produce	json
//	@Success	200
//	@Router		/api/file/clean [post]
func (f FileHandler) Clean(c echo.Context) error {
	var (
		usedFileIds     []int32
		unusedFileInfos []db.File
	)

	context := c.(CustomContext)
	currentUser := context.CurrentUser()
	if currentUser == nil || currentUser.Id != 1 {
		return FailRespWithMsg(c, Fail, "需要先登录")
	}

	// 查询使用到的 fileId
	if err := f.base.db.Model(&db.FileRel{}).
		Select("fileId").
		Distinct().
		Find(&usedFileIds).Error; err != nil {
		f.base.log.Error().Msgf("查询使用到的文件异常: %v", err)
		return FailRespWithMsg(c, Fail, "查询使用到的文件异常")
	}

	// 需要至少有一个元素, 不然 Where("id NOT IN (?)", usedFileIds) 条件不生效
	usedFileIds = append(usedFileIds, 0)

	// 查询没有使用到的 fileInfo
	if err := f.base.db.Model(&db.File{}).
		Where("id NOT IN (?)", usedFileIds).
		Find(&unusedFileInfos).Error; err != nil {
		f.base.log.Error().Msgf("查询没有使用到的文件异常: %v", err)
		return FailRespWithMsg(c, Fail, "查询没有使用到的文件异常")
	}

	// 快速退出
	if len(unusedFileInfos) == 0 {
		return SuccessResp(c, h{
			"num": 0,
		})
	}

	uploadDir := f.base.cfg.UploadDir
	removedDir := filepath.Join(uploadDir, "removed")
	if err := os.MkdirAll(removedDir, 0755); err != nil {
		f.base.log.Error().Msgf("创建删除文件目录异常: %v", err)
		return FailRespWithMsg(c, Fail, "创建删除文件目录异常")
	}

	// 移动本地文件到 removed 目录下
	for _, fileInfo := range unusedFileInfos {
		filePath := fileInfo.Path
		if filePath == "" || !strings.HasPrefix(filePath, "/upload/") {
			continue
		}

		// 先移动原始文件
		filename := strings.TrimPrefix(filePath, "/upload/")
		os.Rename(filepath.Join(uploadDir, filename), filepath.Join(removedDir, filename))

		// 如果是图片，再检查并移动缩略图
		if SupportCompress(filename) {
			ext := filepath.Ext(filename)
			filenameWithoutExt := strings.TrimSuffix(filename, ext)
			thumbFilename := fmt.Sprintf("%s_thumb%s", filenameWithoutExt, ext)
			thumbFilePath := filepath.Join(uploadDir, thumbFilename)

			if fs_util.Exists(thumbFilePath) {
				os.Rename(thumbFilePath, filepath.Join(removedDir, thumbFilename))
			}
		}
	}

	// 删除文件信息
	if err := f.base.db.Delete(&unusedFileInfos).Error; err != nil {
		f.base.log.Error().Msgf("删除文件信息异常: %v", err)
		return FailRespWithMsg(c, Fail, "删除文件信息异常")
	}

	return SuccessResp(c, h{
		"num": len(unusedFileInfos),
	})
}

type PreSignedReq struct {
	ContentType string `json:"contentType,omitempty"` //图片mime类型
}

type s3PresignedResp struct {
	PreSignedUrl string `json:"preSignedUrl,omitempty"` //S3预签名上传地址
	ImageUrl     string `json:"imageUrl,omitempty"`     //实际的图片地址
}

// S3PreSigned godoc
//
//	@Tags		File
//	@Summary	S3预签名
//	@Accept		json
//	@Produce	json
//	@Param		object		body		PreSignedReq	true	"S3预签名"
//	@Param		x-api-token	header		string			true	"登录TOKEN"
//	@Success	200			{object}	s3PresignedResp
//	@Router		/api/file/s3PreSigned [post]
func (f FileHandler) S3PreSigned(c echo.Context) error {
	var (
		req         PreSignedReq
		sysConfig   db.SysConfig
		sysConfigVo vo.FullSysConfigVO
	)
	if err := c.Bind(&req); err != nil {
		return FailResp(c, ParamError)
	}

	if err := f.base.db.First(&sysConfig).Error; errors.Is(err, gorm.ErrRecordNotFound) {
		return FailResp(c, Fail)
	}

	if err := json.Unmarshal([]byte(sysConfig.Content), &sysConfigVo); err != nil {
		f.base.log.Error().Msgf("无法反序列化系统配置, %s", err)
		return FailRespWithMsg(c, Fail, err.Error())
	}

	cfg, err := config.LoadDefaultConfig(
		context.TODO(),
		config.WithRegion(sysConfigVo.S3.Region),
		config.WithEndpointResolver(
			aws.EndpointResolverFunc(
				func(service, region string) (aws.Endpoint, error) {
					return aws.Endpoint{URL: sysConfigVo.S3.Endpoint}, nil
				},
			),
		),
		config.WithCredentialsProvider(
			credentials.NewStaticCredentialsProvider(
				sysConfigVo.S3.AccessKey,
				sysConfigVo.S3.SecretKey,
				"",
			),
		),
	)
	if err != nil {
		f.base.log.Error().Msgf("无法加载SDK配置, %s", err)
		return FailRespWithMsg(c, Fail, err.Error())
	}

	client := s3.NewFromConfig(cfg)
	presignedClient := s3.NewPresignClient(client)

	key := fmt.Sprintf(
		"moments/%s/%s",
		time.Now().Format("2006/01/02"),
		strings.ReplaceAll(uuid.NewString(), "-", ""),
	)
	presignedResult, err := presignedClient.PresignPutObject(
		context.TODO(),
		&s3.PutObjectInput{
			Bucket:      aws.String(sysConfigVo.S3.Bucket),
			Key:         aws.String(key),
			ContentType: aws.String(req.ContentType),
		},
		func(opts *s3.PresignOptions) {
			opts.Expires = time.Minute * 5
		},
	)

	if err != nil {
		f.base.log.Error().Msgf("无法获取预签名URL, %s", err)
		return FailRespWithMsg(c, Fail, fmt.Sprintf("无法获取预签名URL, %s", err))
	}

	return SuccessResp(
		c,
		s3PresignedResp{
			PreSignedUrl: presignedResult.URL,
			ImageUrl:     fmt.Sprintf("%s/%s", sysConfigVo.S3.Domain, key),
		},
	)
}

/*
根据文件路径获取文件 ID
*/
func GetFileIdsByPaths(tx *gorm.DB, filePaths []string) ([]int32, error) {
	// 快速退出
	if len(filePaths) == 0 {
		return []int32{}, nil
	}

	// 过滤出本地文件
	localFilePaths := slice.Filter(filePaths, func(_ int, path string) bool {
		return strings.HasPrefix(path, "/upload/")
	})

	// 获取本地文件的 ID
	var fileIds []int32
	if err := tx.Model(&db.File{}).Where("path IN (?)", localFilePaths).Select("id").Find(&fileIds).Error; err != nil {
		return nil, err
	}

	return fileIds, nil
}

/*
更新文件关系, 先删除旧的文件关系，再创建新的文件关系
*/
func UpdateFileRel(tx *gorm.DB, relId int32, relType string, fileIds []int32) error {
	// 删除旧的文件关系
	if err := tx.Where("relId = ?", relId).
		Where("relType = ?", relType).
		Delete(&db.FileRel{}).Error; err != nil {
		return err
	}

	// 快速退出
	if len(fileIds) == 0 {
		return nil
	}

	// 创建新的文件关系
	fileRels := slice.Map(fileIds, func(_ int, fileId int32) db.FileRel {
		return db.FileRel{
			RelId:   relId,
			RelType: relType,
			FileId:  fileId,
		}
	})

	// 批量创建文件关系
	if err := tx.CreateInBatches(fileRels, 20).Error; err != nil {
		return err
	}

	return nil
}
