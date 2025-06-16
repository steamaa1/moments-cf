package db

import (
	"time"
)

// FileRel 文件关联表
type FileRel struct {
	Id        int32      `gorm:"column:id;primary_key;NOT NULL" json:"id,omitempty"`
	CreatedAt *time.Time `gorm:"column:createdAt;default:CURRENT_TIMESTAMP;NOT NULL" json:"createdAt,omitempty"`
	UpdatedAt *time.Time `gorm:"column:updatedAt;NOT NULL" json:"updatedAt,omitempty"`
	FileId    int32      `gorm:"column:fileId;NOT NULL" json:"fileId,omitempty"`
	MemoId    int32      `gorm:"column:memoId;NOT NULL" json:"memoId,omitempty"`
}

func (i *FileRel) TableName() string {
	return "FileRel"
}
