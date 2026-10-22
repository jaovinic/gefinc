package com.jvtech.gefinc.category;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "categories")
public class Category {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(name = "user_id", nullable = false, updatable = false)
  private long userId;

  @Column(nullable = false)
  private String name;

  @Enumerated(EnumType.STRING)
  @Column(nullable = false, updatable = false)
  private CategoryType type;

  @Column(name = "color_hex", nullable = false)
  private String colorHex;

  protected Category() {}

  public Category(long userId, String name, CategoryType type, String colorHex) {
    this.userId = userId;
    this.name = name;
    this.type = type;
    this.colorHex = colorHex;
  }

  public Long getId() {
    return id;
  }

  public long getUserId() {
    return userId;
  }

  public String getName() {
    return name;
  }

  public CategoryType getType() {
    return type;
  }

  public String getColorHex() {
    return colorHex;
  }

  public void update(String name, String colorHex) {
    this.name = name;
    this.colorHex = colorHex;
  }
}
