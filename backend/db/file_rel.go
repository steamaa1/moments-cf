package db

import (
	"time"
)

const (
	RelTypeMemo       = "memo"
	RelTypeUserAvatar = "user_avatar"
	RelTypeUserCover  = "user_cover"
	RelTypeFavicon    = "favicon"
)

// FileRel 文件关联表
type FileRel struct {
	Id        int32      `gorm:"column:id;primary_key;NOT NULL" json:"id,omitempty"`
	CreatedAt *time.Time `gorm:"column:createdAt;default:CURRENT_TIMESTAMP;NOT NULL" json:"createdAt,omitempty"`
	UpdatedAt *time.Time `gorm:"column:updatedAt;NOT NULL" json:"updatedAt,omitempty"`
	FileId    int32      `gorm:"column:fileId;NOT NULL" json:"fileId,omitempty"`
	RelId     int32      `gorm:"column:relId;NOT NULL" json:"relId,omitempty"`
	RelType   string     `gorm:"column:relType;NOT NULL" json:"relType,omitempty"`
}

func (i *FileRel) TableName() string {
	return "FileRel"
}
